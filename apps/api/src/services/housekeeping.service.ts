import { AssignmentStatus, DocumentModule, HousekeepingSupplyIssueStatus, LostAndFoundStatus, RoomStatus, StockTransactionType, TicketPriority } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { utcToday } from "../lib/tax.js";
import { nextDocumentNumber, writeAuditLog } from "./system.service.js";

const ATTENDANT_ALLOWED: Partial<Record<RoomStatus, RoomStatus[]>> = {
  [RoomStatus.OCCUPIED_DIRTY]: [RoomStatus.CLEANING_IN_PROGRESS],
  [RoomStatus.VACANT_DIRTY]: [RoomStatus.CLEANING_IN_PROGRESS],
  [RoomStatus.CLEANING_IN_PROGRESS]: [RoomStatus.VACANT_CLEAN],
};
const SUPERVISOR_ALLOWED: Partial<Record<RoomStatus, RoomStatus[]>> = {
  ...ATTENDANT_ALLOWED,
  [RoomStatus.VACANT_CLEAN]: [RoomStatus.INSPECTED, RoomStatus.VACANT_DIRTY],
  [RoomStatus.INSPECTED]: [RoomStatus.VACANT_DIRTY, RoomStatus.OUT_OF_ORDER, RoomStatus.OUT_OF_SERVICE],
  [RoomStatus.OUT_OF_ORDER]: [RoomStatus.VACANT_DIRTY],
  [RoomStatus.OUT_OF_SERVICE]: [RoomStatus.VACANT_DIRTY],
  [RoomStatus.MAINTENANCE]: [RoomStatus.VACANT_DIRTY],
};

function dateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError(400, "HK-003", "Date must use YYYY-MM-DD format");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new AppError(400, "HK-003", "Invalid date");
  return date;
}

function isSupervisor(roleName: string) {
  return roleName.includes("Supervisor") || roleName.includes("Administrator");
}

export async function getHousekeepingDashboard(assignmentDate?: string) {
  const selectedDate = assignmentDate ? dateOnly(assignmentDate) : utcToday();
  const [rooms, assignments, attendants, lostAndFound, openCleaningLogs] = await Promise.all([
    prisma.room.findMany({
      where: { isActive: true },
      include: {
        roomType: true,
        reservations: { where: { status: "CHECKED_IN" }, take: 1, include: { guest: true } },
      },
      orderBy: [{ floor: "asc" }, { number: "asc" }],
    }),
    prisma.housekeepingAssignment.findMany({
      where: { date: selectedDate }, include: { room: true, attendant: { select: { id: true, fullName: true } } }, orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({
      where: { isActive: true, OR: [{ department: { name: { contains: "Housekeeping", mode: "insensitive" } } }, { role: { name: { contains: "Housekeeping", mode: "insensitive" } } }] },
      select: { id: true, fullName: true }, orderBy: { fullName: "asc" },
    }),
    prisma.lostAndFound.findMany({ include: { foundBy: { select: { fullName: true } } }, orderBy: [{ dateFound: "desc" }, { createdAt: "desc" }], take: 250 }),
    prisma.roomCleanLog.findMany({ where: { endTime: null }, select: { roomId: true, attendantUserId: true, startTime: true } }),
  ]);
  const summary = rooms.reduce<Record<string, number>>((acc, room) => {
    acc[room.status] = (acc[room.status] ?? 0) + 1;
    return acc;
  }, {});
  return { rooms, summary, total: rooms.length, assignments, attendants, lostAndFound, openCleaningLogs };
}

export async function updateRoomStatus(input: {
  roomId: string; status: RoomStatus; userId: string; roleName: string; notes?: string; ipAddress?: string;
}) {
  const supervisor = isSupervisor(input.roleName);
  if (input.status === RoomStatus.INSPECTED && !supervisor) throw new AppError(403, "HK-004", "Only a housekeeping supervisor can inspect a room");
  if (input.status === RoomStatus.VACANT_DIRTY && !supervisor) throw new AppError(403, "HK-004", "Only a housekeeping supervisor can reject an inspection");
  const room = await prisma.room.findUnique({ where: { id: input.roomId } });
  if (!room) throw new AppError(404, "HK-001", "Room not found");
  const allowed = (supervisor ? SUPERVISOR_ALLOWED : ATTENDANT_ALLOWED)[room.status] ?? [];
  if (!allowed.includes(input.status)) throw new AppError(400, "HK-002", `Cannot transition room from ${room.status} to ${input.status}`);
  if (input.status === RoomStatus.VACANT_DIRTY && !input.notes?.trim()) throw new AppError(400, "HK-005", "Provide feedback when rejecting a room inspection");

  const today = utcToday();
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.room.updateMany({ where: { id: room.id, status: room.status }, data: { status: input.status } });
    if (changed.count !== 1) throw new AppError(409, "HK-006", "Room status changed; refresh and try again");
    if (input.status === RoomStatus.CLEANING_IN_PROGRESS) {
      const assignment = await tx.housekeepingAssignment.findUnique({ where: { date_roomId: { date: today, roomId: room.id } } });
      if (assignment && assignment.attendantUserId !== input.userId) throw new AppError(403, "HK-007", "This room is assigned to another attendant");
      if (assignment) await tx.housekeepingAssignment.update({ where: { id: assignment.id }, data: { status: AssignmentStatus.IN_PROGRESS } });
      await tx.roomCleanLog.create({ data: { roomId: room.id, attendantUserId: input.userId, initialStatus: room.status, targetStatus: input.status, notes: input.notes } });
    } else if (input.status === RoomStatus.VACANT_CLEAN) {
      const log = await tx.roomCleanLog.findFirst({ where: { roomId: room.id, endTime: null }, orderBy: { startTime: "desc" } });
      if (log) await tx.roomCleanLog.update({ where: { id: log.id }, data: { endTime: new Date(), targetStatus: input.status, notes: input.notes ?? log.notes } });
      await tx.housekeepingAssignment.updateMany({ where: { date: today, roomId: room.id, status: { not: AssignmentStatus.COMPLETED } }, data: { status: AssignmentStatus.COMPLETED } });
    } else if (input.status === RoomStatus.INSPECTED || input.status === RoomStatus.VACANT_DIRTY) {
      const log = await tx.roomCleanLog.findFirst({ where: { roomId: room.id, endTime: { not: null }, inspectionPassed: null }, orderBy: { startTime: "desc" } });
      if (log) await tx.roomCleanLog.update({ where: { id: log.id }, data: { supervisorUserId: input.userId, inspectionPassed: input.status === RoomStatus.INSPECTED, rejectionNotes: input.status === RoomStatus.VACANT_DIRTY ? input.notes : null, targetStatus: input.status } });
    }
    return tx.room.findUniqueOrThrow({ where: { id: room.id }, include: { roomType: true } });
  });
  await writeAuditLog({ userId: input.userId, module: "Housekeeping", action: "ROOM_STATUS_CHANGE", entityType: "Room", entityId: room.id, details: { previousStatus: room.status, newStatus: input.status, notes: input.notes }, ipAddress: input.ipAddress });
  return updated;
}

export async function bulkAssignRooms(input: { roomIds: string[]; attendantUserId: string; date: string; userId: string; roleName: string; ipAddress?: string }) {
  if (!isSupervisor(input.roleName)) throw new AppError(403, "HK-015", "Only a housekeeping supervisor can assign rooms");
  const date = dateOnly(input.date);
  if (date < utcToday()) throw new AppError(400, "HK-016", "Room assignments cannot be made for a past date");
  const [attendant, rooms] = await Promise.all([
    prisma.user.findFirst({ where: { id: input.attendantUserId, isActive: true, OR: [{ department: { name: { contains: "Housekeeping", mode: "insensitive" } } }, { role: { name: { contains: "Housekeeping", mode: "insensitive" } } }] } }),
    prisma.room.findMany({ where: { id: { in: input.roomIds }, isActive: true }, select: { id: true, status: true } }),
  ]);
  if (!attendant) throw new AppError(400, "HK-008", "Select an active housekeeping attendant");
  if (rooms.length !== new Set(input.roomIds).size) throw new AppError(400, "HK-009", "One or more selected rooms are unavailable");
  if (rooms.some((room) => room.status === RoomStatus.OUT_OF_ORDER || room.status === RoomStatus.OUT_OF_SERVICE || room.status === RoomStatus.MAINTENANCE)) throw new AppError(400, "HK-018", "Rooms blocked for maintenance cannot be assigned to housekeeping");
  await prisma.$transaction(input.roomIds.map((roomId) => prisma.housekeepingAssignment.upsert({
    where: { date_roomId: { date, roomId } },
    create: { date, roomId, attendantUserId: input.attendantUserId },
    update: { attendantUserId: input.attendantUserId },
  })));
  await writeAuditLog({ userId: input.userId, module: "Housekeeping", action: "ROOM_ASSIGNMENT", details: { roomIds: input.roomIds, attendantUserId: input.attendantUserId, date: input.date }, ipAddress: input.ipAddress });
  return { assigned: rooms.length };
}

export async function reportRoomDefect(input: { roomId: string; description: string; priority?: TicketPriority; userId: string; ipAddress?: string }) {
  const room = await prisma.room.findUnique({ where: { id: input.roomId } });
  if (!room) throw new AppError(404, "HK-001", "Room not found");
  if (room.status === RoomStatus.OUT_OF_ORDER || room.status === RoomStatus.OUT_OF_SERVICE || room.status === RoomStatus.MAINTENANCE) throw new AppError(400, "HK-010", "Room is already blocked for maintenance");
  const ticketNumber = await nextDocumentNumber("MAINTENANCE");
  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.maintenanceTicket.create({ data: { ticketNumber, reporterUserId: input.userId, roomId: room.id, description: input.description, priority: input.priority ?? TicketPriority.MEDIUM } });
    if (room.status !== RoomStatus.OCCUPIED && room.status !== RoomStatus.OCCUPIED_DIRTY) {
      const changed = await tx.room.updateMany({ where: { id: room.id, status: room.status }, data: { status: RoomStatus.MAINTENANCE } });
      if (changed.count !== 1) throw new AppError(409, "HK-006", "Room status changed; refresh and try again");
    }
    return created;
  });
  await writeAuditLog({ userId: input.userId, module: "Housekeeping", action: "ROOM_DEFECT_REPORTED", entityType: "MaintenanceTicket", entityId: ticket.id, details: { roomId: room.id, ticketNumber, previousRoomStatus: room.status, priority: ticket.priority }, ipAddress: input.ipAddress });
  return ticket;
}

export async function createLostAndFound(input: { itemDescription: string; locationFound: string; dateFound: string; storageLocation?: string; notes?: string; userId: string; ipAddress?: string }) {
  const item = await prisma.lostAndFound.create({ data: { itemDescription: input.itemDescription, locationFound: input.locationFound, dateFound: dateOnly(input.dateFound), storageLocation: input.storageLocation, notes: input.notes, foundByUserId: input.userId }, include: { foundBy: { select: { fullName: true } } } });
  await writeAuditLog({ userId: input.userId, module: "Housekeeping", action: "LOST_FOUND_RECORDED", entityType: "LostAndFound", entityId: item.id, details: { locationFound: item.locationFound }, ipAddress: input.ipAddress });
  return item;
}

export async function updateLostAndFound(input: { id: string; status: LostAndFoundStatus; claimedBy?: string; storageLocation?: string; userId: string; roleName: string; ipAddress?: string }) {
  if (!isSupervisor(input.roleName)) throw new AppError(403, "HK-011", "Only a housekeeping supervisor can change lost-and-found disposition");
  const existing = await prisma.lostAndFound.findUnique({ where: { id: input.id } });
  if (!existing) throw new AppError(404, "HK-012", "Lost-and-found item not found");
  if (existing.status !== LostAndFoundStatus.UNCLAIMED) throw new AppError(400, "HK-013", "Only unclaimed items can be updated");
  if (input.status === LostAndFoundStatus.UNCLAIMED) throw new AppError(400, "HK-017", "Choose a final item disposition");
  if (input.status === LostAndFoundStatus.CLAIMED && !input.claimedBy?.trim()) throw new AppError(400, "HK-014", "Enter the claimant's name");
  const item = await prisma.lostAndFound.update({ where: { id: input.id }, data: { status: input.status, claimedBy: input.status === LostAndFoundStatus.CLAIMED ? input.claimedBy : undefined, claimedDate: input.status === LostAndFoundStatus.CLAIMED ? utcToday() : undefined, storageLocation: input.storageLocation ?? existing.storageLocation }, include: { foundBy: { select: { fullName: true } } } });
  await writeAuditLog({ userId: input.userId, module: "Housekeeping", action: "LOST_FOUND_STATUS_CHANGE", entityType: "LostAndFound", entityId: item.id, details: { previousStatus: existing.status, newStatus: item.status, claimedBy: item.claimedBy }, ipAddress: input.ipAddress });
  return item;
}

export async function getHousekeepingSupplyConfiguration() {
  const [items, locations, standards] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { isActive: true, category: { contains: "Housekeeping", mode: "insensitive" } }, include: { balances: { include: { storeLocation: true } } }, orderBy: { name: "asc" } }),
    prisma.storeLocation.findMany({ where: { isActive: true }, orderBy: { locationName: "asc" } }),
    prisma.housekeepingSupplyStandard.findMany({ where: { isActive: true }, include: { item: true, storeLocation: true }, orderBy: { item: { name: "asc" } } }),
  ]);
  return { items, locations, standards };
}

export async function saveHousekeepingSupplyStandard(input: { itemId: string; storeLocationId: string; quantityPerRoom: number; userId: string; roleName: string; ipAddress?: string }) {
  if (!isSupervisor(input.roleName)) throw new AppError(403, "HK-019", "Only a housekeeping supervisor can configure supply standards");
  const [item, location] = await Promise.all([
    prisma.inventoryItem.findFirst({ where: { id: input.itemId, isActive: true, category: { contains: "Housekeeping", mode: "insensitive" } } }),
    prisma.storeLocation.findFirst({ where: { id: input.storeLocationId, isActive: true } }),
  ]);
  if (!item) throw new AppError(400, "HK-020", "Select an active housekeeping supply item");
  if (!location) throw new AppError(400, "HK-021", "Select an active store location");
  const standard = await prisma.housekeepingSupplyStandard.upsert({
    where: { itemId_storeLocationId: { itemId: item.id, storeLocationId: location.id } },
    create: { itemId: item.id, storeLocationId: location.id, quantityPerRoom: input.quantityPerRoom },
    update: { quantityPerRoom: input.quantityPerRoom, isActive: true },
    include: { item: true, storeLocation: true },
  });
  await writeAuditLog({ userId: input.userId, module: "Housekeeping", action: "HOUSEKEEPING_SUPPLY_STANDARD_SAVED", entityType: "HousekeepingSupplyStandard", entityId: standard.id, details: { itemId: item.id, storeLocationId: location.id, quantityPerRoom: input.quantityPerRoom }, ipAddress: input.ipAddress });
  return standard;
}

export async function removeHousekeepingSupplyStandard(input: { id: string; userId: string; roleName: string; ipAddress?: string }) {
  if (!isSupervisor(input.roleName)) throw new AppError(403, "HK-019", "Only a housekeeping supervisor can configure supply standards");
  const standard = await prisma.housekeepingSupplyStandard.update({ where: { id: input.id }, data: { isActive: false } });
  await writeAuditLog({ userId: input.userId, module: "Housekeeping", action: "HOUSEKEEPING_SUPPLY_STANDARD_REMOVED", entityType: "HousekeepingSupplyStandard", entityId: standard.id, ipAddress: input.ipAddress });
  return standard;
}

export async function listHousekeepingSupplyIssues(date: string) {
  return prisma.housekeepingSupplyIssue.findMany({
    where: { date: dateOnly(date) },
    include: { attendant: { select: { id: true, fullName: true } }, createdBy: { select: { id: true, fullName: true } }, approvedBy: { select: { fullName: true } }, lines: { include: { item: true, storeLocation: true } } },
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function generateHousekeepingSupplyIssue(input: { attendantUserId: string; date: string; userId: string; roleName: string; ipAddress?: string }) {
  if (!isSupervisor(input.roleName) && input.attendantUserId !== input.userId) throw new AppError(403, "HK-022", "You can only prepare a voucher for your own housekeeping shift");
  const date = dateOnly(input.date);
  const [attendant, completed, standards] = await Promise.all([
    prisma.user.findFirst({ where: { id: input.attendantUserId, isActive: true, OR: [{ department: { name: { contains: "Housekeeping", mode: "insensitive" } } }, { role: { name: { contains: "Housekeeping", mode: "insensitive" } } }] } }),
    prisma.housekeepingAssignment.count({ where: { date, attendantUserId: input.attendantUserId, status: AssignmentStatus.COMPLETED } }),
    prisma.housekeepingSupplyStandard.findMany({ where: { isActive: true }, include: { item: true, storeLocation: true } }),
  ]);
  if (!attendant) throw new AppError(400, "HK-008", "Select an active housekeeping attendant");
  if (completed < 1) throw new AppError(400, "HK-023", "Complete at least one assigned room before generating a supply voucher");
  if (!standards.length) throw new AppError(400, "HK-024", "Configure at least one per-room supply standard first");
  const existing = await prisma.housekeepingSupplyIssue.findUnique({ where: { date_attendantUserId: { date, attendantUserId: attendant.id } } });
  if (existing?.status !== undefined && existing.status !== HousekeepingSupplyIssueStatus.DRAFT) throw new AppError(409, "HK-025", "This shift already has a finalized supply voucher");
  let issueNumber = existing?.issueNumber;
  if (!issueNumber) {
    await prisma.documentNumberingPattern.upsert({
      where: { module: DocumentModule.HOUSEKEEPING_ISSUES },
      create: { module: DocumentModule.HOUSEKEEPING_ISSUES, prefix: `HK-ISS-${new Date().getUTCFullYear()}-`, currentSequence: 1, paddingDigits: 4 },
      update: {},
    });
    issueNumber = await nextDocumentNumber(DocumentModule.HOUSEKEEPING_ISSUES);
  }
  const issue = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.housekeepingSupplyIssueLine.deleteMany({ where: { issueId: existing.id } });
      await tx.housekeepingSupplyIssue.update({ where: { id: existing.id }, data: { roomCount: completed } });
      await tx.housekeepingSupplyIssueLine.createMany({ data: standards.map((standard) => ({ issueId: existing.id, itemId: standard.itemId, storeLocationId: standard.storeLocationId, quantityPerRoom: standard.quantityPerRoom, quantity: Number(standard.quantityPerRoom) * completed })) });
      return tx.housekeepingSupplyIssue.findUniqueOrThrow({ where: { id: existing.id }, include: { attendant: { select: { id: true, fullName: true } }, lines: { include: { item: true, storeLocation: true } } } });
    }
    return tx.housekeepingSupplyIssue.create({
      data: { issueNumber, date, attendantUserId: attendant.id, roomCount: completed, createdById: input.userId, lines: { create: standards.map((standard) => ({ itemId: standard.itemId, storeLocationId: standard.storeLocationId, quantityPerRoom: standard.quantityPerRoom, quantity: Number(standard.quantityPerRoom) * completed })) } },
      include: { attendant: { select: { id: true, fullName: true } }, lines: { include: { item: true, storeLocation: true } } },
    });
  });
  await writeAuditLog({ userId: input.userId, module: "Housekeeping", action: "HOUSEKEEPING_SUPPLY_ISSUE_DRAFTED", entityType: "HousekeepingSupplyIssue", entityId: issue.id, details: { issueNumber, date: input.date, attendantUserId: attendant.id, roomCount: completed }, ipAddress: input.ipAddress });
  return issue;
}

export async function approveHousekeepingSupplyIssue(input: { id: string; userId: string; ipAddress?: string }) {
  const issue = await prisma.$transaction(async (tx) => {
    const draft = await tx.housekeepingSupplyIssue.findUnique({ where: { id: input.id }, include: { lines: { include: { item: true } } } });
    if (!draft) throw new AppError(404, "HK-026", "Housekeeping supply voucher not found");
    if (draft.status !== HousekeepingSupplyIssueStatus.DRAFT) throw new AppError(409, "HK-027", "Only draft supply vouchers can be approved");
    if (draft.createdById === input.userId) throw new AppError(403, "HK-030", "The voucher creator cannot approve their own supply issue");
    const claimed = await tx.housekeepingSupplyIssue.updateMany({ where: { id: draft.id, status: HousekeepingSupplyIssueStatus.DRAFT }, data: { status: HousekeepingSupplyIssueStatus.APPROVED, approvedById: input.userId, approvedAt: new Date() } });
    if (claimed.count !== 1) throw new AppError(409, "HK-027", "Voucher status changed; refresh and try again");
    for (const line of draft.lines) {
      const qty = Number(line.quantity);
      const balance = await tx.stockBalance.findUnique({ where: { itemId_storeLocationId: { itemId: line.itemId, storeLocationId: line.storeLocationId } } });
      if (!balance || Number(balance.quantityOnHand) < qty) throw new AppError(400, "HK-028", `Insufficient stock for ${line.item.name}`);
      const changed = await tx.stockBalance.updateMany({ where: { id: balance.id, quantityOnHand: { gte: qty } }, data: { quantityOnHand: { decrement: qty } } });
      if (changed.count !== 1) throw new AppError(409, "HK-029", `Stock changed while approving ${line.item.name}; refresh and try again`);
      const unitCost = Number(line.item.currentAverageCost);
      await tx.stockTransaction.create({ data: { itemId: line.itemId, storeLocationId: line.storeLocationId, transactionType: StockTransactionType.ISSUE, quantity: qty, unitCost, totalCost: qty * unitCost, referenceDocument: draft.issueNumber, createdById: input.userId } });
    }
    return tx.housekeepingSupplyIssue.findUniqueOrThrow({ where: { id: draft.id }, include: { attendant: { select: { id: true, fullName: true } }, approvedBy: { select: { fullName: true } }, lines: { include: { item: true, storeLocation: true } } } });
  });
  await writeAuditLog({ userId: input.userId, module: "Inventory", action: "HOUSEKEEPING_SUPPLY_ISSUE_APPROVED", entityType: "HousekeepingSupplyIssue", entityId: issue.id, details: { issueNumber: issue.issueNumber, roomCount: issue.roomCount }, ipAddress: input.ipAddress });
  return issue;
}
