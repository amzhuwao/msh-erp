import { GroupPaymentType, GroupReservationStatus, GroupRoomAllocationStatus, ReservationStatus, RoomStatus, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { nextDocumentNumber, writeAuditLog } from "./system.service.js";
import { assertGuestIdentity } from "../lib/identity.js";
import { checkRoomOverlap } from "./reservation.service.js";
import { utcToday } from "../lib/tax.js";
import { checkOutReservation } from "./folio.service.js";

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0]!, lastName: "Guest" };
  }
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

function guestEmailFromGroup(groupCode: string, guestId: string): string {
  const slug = groupCode.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${slug}-${guestId.slice(-8)}@group.msh.local`;
}

async function resolveGroupGuestRoom(
  groupId: string,
  guest: { id: string; fullName: string; roomTypeCode: string | null; roomNumber: string | null },
  roomIdOverride?: string,
) {
  const allocations = await prisma.groupRoom.findMany({
    where: { groupReservationId: groupId },
    include: { room: true, roomType: true },
  });

  if (allocations.length === 0) {
    throw new AppError(400, "GRP-010", "No rooms allocated for this group");
  }

  const guestsWithRoomAssignments = await prisma.groupGuest.findMany({
    where: {
      groupReservationId: groupId,
      checkInStatus: { not: "CHECKED_OUT" },
      id: { not: guest.id },
    },
    select: { roomNumber: true },
  });
  const usedRoomNumbers = new Set(guestsWithRoomAssignments.map((g) => g.roomNumber).filter(Boolean));

  if (roomIdOverride) {
    const allocation = allocations.find((a) => a.roomId === roomIdOverride);
    if (!allocation) {
      throw new AppError(400, "GRP-011", "Selected room is not allocated to this group");
    }
    if (usedRoomNumbers.has(allocation.room.number)) {
      throw new AppError(409, "GRP-012", "Room is already assigned to another checked-in guest");
    }
    return allocation;
  }

  if (guest.roomNumber) {
    const assigned = allocations.find((allocation) => allocation.room.number === guest.roomNumber);
    if (assigned && !usedRoomNumbers.has(assigned.room.number)) return assigned;
  }

  const byName = allocations.find(
    (a) =>
      a.assignedGuestName?.toLowerCase() === guest.fullName.toLowerCase() &&
      !usedRoomNumbers.has(a.room.number),
  );
  if (byName) return byName;

  if (guest.roomTypeCode) {
    const byType = allocations.find(
      (a) =>
        a.roomType.code === guest.roomTypeCode &&
        !usedRoomNumbers.has(a.room.number),
    );
    if (byType) return byType;
  }

  const available = allocations.find((a) => !usedRoomNumbers.has(a.room.number));
  if (available) return available;

  throw new AppError(409, "GRP-013", "No available room allocation for this guest");
}

function toDateOnly(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function getGroupDashboard() {
  const today = utcToday();
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const [tentative, confirmed, arrivalsToday, departuresToday, cancelled] = await Promise.all([
    prisma.groupReservation.count({ where: { status: "TENTATIVE" } }),
    prisma.groupReservation.count({ where: { status: "CONFIRMED" } }),
    prisma.groupReservation.count({
      where: { arrivalDate: { gte: today, lt: tomorrow }, status: "CONFIRMED" },
    }),
    prisma.groupReservation.count({
      where: { departureDate: { gte: today, lt: tomorrow }, status: "CONFIRMED" },
    }),
    prisma.groupReservation.count({ where: { status: "CANCELLED" } }),
  ]);

  return { tentative, confirmed, arrivalsToday, departuresToday, cancelled };
}

export async function listGroupReservations(status?: string) {
  return prisma.groupReservation.findMany({
    where: status ? { status: status as GroupReservationStatus } : undefined,
    include: {
      company: true,
      _count: { select: { guests: true, roomAllocations: true } },
    },
    orderBy: { arrivalDate: "asc" },
  });
}

export async function getGroupReservation(id: string) {
  const group = await prisma.groupReservation.findUnique({
    where: { id },
    include: {
      company: true,
      guests: { orderBy: { fullName: "asc" } },
      roomAllocations: { include: { room: true, roomType: true } },
      charges: true,
      invoices: true,
      reservations: { include: { guest: true, room: true } },
      createdBy: { select: { fullName: true } },
    },
  });
  if (!group) {
    throw new AppError(404, "GRP-001", "Group reservation not found");
  }
  return group;
}

export async function createGroupReservation(input: {
  groupName: string;
  companyId?: string;
  contactPerson: string;
  phone: string;
  email: string;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  roomCount: number;
  specialRequests?: string;
  depositAmount?: number;
  createdById: string;
  ipAddress?: string;
}) {
  const arrival = toDateOnly(input.arrivalDate);
  const departure = toDateOnly(input.departureDate);

  if (arrival >= departure) {
    throw new AppError(400, "GRP-002", "Arrival date must be before departure date");
  }

  if (input.roomCount < 1) {
    throw new AppError(400, "GRP-003", "At least one room is required");
  }

  const groupCode = await nextDocumentNumber("GROUP_RESERVATIONS");

  const group = await prisma.groupReservation.create({
    data: {
      groupCode,
      groupName: input.groupName,
      companyId: input.companyId,
      contactPerson: input.contactPerson,
      phone: input.phone,
      email: input.email,
      arrivalDate: arrival,
      departureDate: departure,
      adults: input.adults,
      children: input.children,
      roomCount: input.roomCount,
      specialRequests: input.specialRequests,
      depositAmount: input.depositAmount ?? 0,
      balance: -(input.depositAmount ?? 0),
      createdById: input.createdById,
      ...(input.depositAmount && input.depositAmount > 0 ? {
        payments: { create: { type: GroupPaymentType.DEPOSIT, amount: input.depositAmount, paymentMethod: "UNSPECIFIED", createdById: input.createdById } },
      } : {}),
    },
    include: { company: true },
  });

  await writeAuditLog({
    userId: input.createdById,
    module: "GroupReservations",
    action: "GROUP_CREATE",
    entityType: "GroupReservation",
    entityId: group.id,
    details: { groupCode },
    ipAddress: input.ipAddress,
  });

  return group;
}

export async function confirmGroupReservation(input: {
  groupId: string;
  userId: string;
  ipAddress?: string;
}) {
  const group = await prisma.groupReservation.findUnique({
    where: { id: input.groupId },
    include: { roomAllocations: true },
  });

  if (!group) {
    throw new AppError(404, "GRP-001", "Group reservation not found");
  }
  if (group.status !== GroupReservationStatus.TENTATIVE) {
    throw new AppError(400, "GRP-004", "Only tentative groups can be confirmed");
  }

  if (group.roomAllocations.length < group.roomCount) {
    throw new AppError(
      400,
      "GRP-005",
      `Allocate at least ${group.roomCount} rooms before confirming (${group.roomAllocations.length} allocated)`,
    );
  }

  const updated = await prisma.groupReservation.update({
    where: { id: group.id },
    data: { status: GroupReservationStatus.CONFIRMED },
    include: { company: true, roomAllocations: { include: { room: true } }, guests: true },
  });

  await writeAuditLog({
    userId: input.userId,
    module: "GroupReservations",
    action: "GROUP_CONFIRM",
    entityType: "GroupReservation",
    entityId: group.id,
    ipAddress: input.ipAddress,
  });

  return updated;
}

export async function allocateGroupRoom(input: {
  groupId: string;
  roomId: string;
  rate: number;
  assignedGuestName?: string;
  userId: string;
  ipAddress?: string;
}) {
  const group = await prisma.groupReservation.findUnique({ where: { id: input.groupId } });
  if (!group) {
    throw new AppError(404, "GRP-001", "Group reservation not found");
  }
  if (group.status === GroupReservationStatus.CANCELLED || group.status === GroupReservationStatus.CLOSED) {
    throw new AppError(400, "GRP-006", "Cannot allocate rooms on a closed or cancelled group");
  }

  const room = await prisma.room.findUnique({
    where: { id: input.roomId },
    include: { roomType: true },
  });
  if (!room) {
    throw new AppError(404, "GRP-007", "Room not found");
  }

  await checkRoomOverlap(input.roomId, group.arrivalDate, group.departureDate);

  const existingGroupRoom = await prisma.groupRoom.findFirst({
    where: {
      roomId: input.roomId,
      groupReservation: {
        status: { in: ["TENTATIVE", "CONFIRMED"] },
        id: { not: input.groupId },
        arrivalDate: { lt: group.departureDate },
        departureDate: { gt: group.arrivalDate },
      },
    },
  });
  if (existingGroupRoom) {
    throw new AppError(409, "GRP-008", "Room is blocked by another group for overlapping dates");
  }

  const allocation = await prisma.groupRoom.upsert({
    where: {
      groupReservationId_roomId: {
        groupReservationId: input.groupId,
        roomId: input.roomId,
      },
    },
    create: {
      groupReservationId: input.groupId,
      roomId: input.roomId,
      roomTypeId: room.roomTypeId,
      rate: input.rate,
      status: GroupRoomAllocationStatus.BLOCKED,
      assignedGuestName: input.assignedGuestName,
    },
    update: {
      rate: input.rate,
      assignedGuestName: input.assignedGuestName,
    },
    include: { room: true, roomType: true },
  });

  await writeAuditLog({
    userId: input.userId,
    module: "GroupReservations",
    action: "ROOM_ALLOCATION",
    entityType: "GroupReservation",
    entityId: input.groupId,
    details: { roomId: input.roomId, roomNumber: room.number },
    ipAddress: input.ipAddress,
  });

  return allocation;
}

export async function addGroupGuest(input: {
  groupId: string;
  fullName: string;
  nationality: string;
  nationalId?: string;
  passportNumber?: string;
  roomTypeCode?: string;
  vipStatus?: "NONE" | "VIP1" | "VIP2" | "VIP3";
  notes?: string;
  userId: string;
  ipAddress?: string;
}) {
  const group = await prisma.groupReservation.findUnique({ where: { id: input.groupId } });
  if (!group) {
    throw new AppError(404, "GRP-001", "Group reservation not found");
  }

  assertGuestIdentity(input);

  const duplicate = await prisma.groupGuest.findFirst({
    where: {
      groupReservationId: input.groupId,
      fullName: { equals: input.fullName.trim(), mode: "insensitive" },
    },
  });
  if (duplicate) {
    throw new AppError(409, "GRP-020", "A guest with this name is already on the group rooming list");
  }

  const guest = await prisma.groupGuest.create({
    data: {
      groupReservationId: input.groupId,
      fullName: input.fullName.trim(),
      nationality: input.nationality,
      nationalId: input.nationalId?.trim() || undefined,
      passportNumber: input.passportNumber?.trim() || undefined,
      roomTypeCode: input.roomTypeCode?.trim().toUpperCase() || undefined,
      vipStatus: input.vipStatus ?? "NONE",
      notes: input.notes?.trim() || undefined,
    },
  });

  await writeAuditLog({
    userId: input.userId,
    module: "GroupReservations",
    action: "GROUP_GUEST_ADD",
    entityType: "GroupGuest",
    entityId: guest.id,
    details: { groupCode: group.groupCode, fullName: guest.fullName },
    ipAddress: input.ipAddress,
  });

  return guest;
}

export interface RoomingListRow {
  fullName: string;
  nationality?: string;
  nationalId?: string;
  passportNumber?: string;
  roomTypeCode?: string;
  vipStatus?: string;
  notes?: string;
}

export async function importRoomingList(input: {
  groupId: string;
  rows: RoomingListRow[];
  userId: string;
  ipAddress?: string;
}) {
  const group = await prisma.groupReservation.findUnique({
    where: { id: input.groupId },
    include: { guests: true },
  });
  if (!group) {
    throw new AppError(404, "GRP-001", "Group reservation not found");
  }

  const errors: { row: number; message: string }[] = [];
  const valid: RoomingListRow[] = [];

  input.rows.forEach((row, index) => {
    if (!row.fullName?.trim()) {
      errors.push({ row: index + 1, message: "Full name is required" });
      return;
    }
    if (!row.nationality?.trim()) {
      errors.push({ row: index + 1, message: "Nationality is required" });
      return;
    }
    if (!row.nationalId?.trim() && !row.passportNumber?.trim()) {
      errors.push({ row: index + 1, message: "National ID or passport is required" });
      return;
    }
    const duplicate = group.guests.some(
      (g) => g.fullName.toLowerCase() === row.fullName.trim().toLowerCase(),
    );
    if (duplicate) {
      errors.push({ row: index + 1, message: "Duplicate guest name in group" });
      return;
    }
    valid.push(row);
  });

  if (errors.length > 0 && valid.length === 0) {
    throw new AppError(400, "GRP-009", "Rooming list import failed validation", { errors });
  }

  const created = await prisma.$transaction(async (tx) => {
    const results = [];
    for (const row of valid) {
      const guest = await tx.groupGuest.create({
        data: {
          groupReservationId: input.groupId,
          fullName: row.fullName.trim(),
          nationality: row.nationality,
          nationalId: row.nationalId,
          passportNumber: row.passportNumber,
          roomTypeCode: row.roomTypeCode,
          vipStatus: (row.vipStatus as "NONE" | "VIP1" | "VIP2" | "VIP3") ?? "NONE",
          notes: row.notes,
        },
      });
      results.push(guest);
    }
    return results;
  });

  await writeAuditLog({
    userId: input.userId,
    module: "GroupReservations",
    action: "ROOMING_LIST_IMPORT",
    entityType: "GroupReservation",
    entityId: input.groupId,
    details: { imported: created.length, errors },
    ipAddress: input.ipAddress,
  });

  return { imported: created.length, errors, guests: created };
}

export async function getGroupFolio(groupId: string) {
  const group = await prisma.groupReservation.findUnique({
    where: { id: groupId },
    include: { charges: { orderBy: { chargeDate: "desc" } }, invoices: { include: { payments: true, charges: true }, orderBy: { createdAt: "desc" } }, payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!group) {
    throw new AppError(404, "GRP-001", "Group reservation not found");
  }

  const totalCharges = group.charges.reduce((s, c) => s + Number(c.amount), 0);
  const totalInvoiced = group.invoices.reduce((s, i) => s + Number(i.amount), 0);
  const outstanding = group.invoices.reduce((s, i) => s + Number(i.outstanding), 0);

  return {
    groupId: group.id,
    groupCode: group.groupCode,
    depositAmount: Number(group.depositAmount),
    balance: Number(group.balance),
    totalCharges,
    totalInvoiced,
    outstanding,
    charges: group.charges,
    invoices: group.invoices,
    payments: group.payments,
  };
}

async function refreshGroupBalance(tx: Prisma.TransactionClient | typeof prisma, groupId: string) {
  const [charges, payments] = await Promise.all([
    tx.groupCharge.aggregate({ where: { groupReservationId: groupId, paidBy: { not: "GUEST" } }, _sum: { amount: true } }),
    tx.groupPayment.aggregate({ where: { groupReservationId: groupId }, _sum: { amount: true } }),
  ]);
  const balance = Number(charges._sum.amount ?? 0) - Number(payments._sum.amount ?? 0);
  await tx.groupReservation.update({ where: { id: groupId }, data: { balance } });
  return balance;
}

export async function addGroupCharge(input: { groupId: string; chargeType: string; amount: number; paidBy: "MASTER" | "GUEST" | "COMPANY" | "SPONSOR"; userId: string; ipAddress?: string }) {
  const group = await prisma.groupReservation.findUnique({ where: { id: input.groupId } });
  if (!group) throw new AppError(404, "GRP-001", "Group reservation not found");
  if (group.status === GroupReservationStatus.CLOSED || group.status === GroupReservationStatus.CANCELLED) throw new AppError(400, "GRP-021", "Cannot add charges to a closed or cancelled group");
  const charge = await prisma.$transaction(async (tx) => {
    const result = await tx.groupCharge.create({ data: { groupReservationId: group.id, chargeType: input.chargeType.trim(), amount: input.amount, paidBy: input.paidBy, chargeDate: utcToday() } });
    await refreshGroupBalance(tx, group.id);
    return result;
  });
  await writeAuditLog({ userId: input.userId, module: "GroupReservations", action: "GROUP_CHARGE_ADD", entityType: "GroupCharge", entityId: charge.id, details: { amount: input.amount, chargeType: input.chargeType }, ipAddress: input.ipAddress });
  return charge;
}

export async function createGroupInvoice(input: { groupId: string; invoiceType: string; paidBy: "MASTER" | "COMPANY" | "SPONSOR"; userId: string; ipAddress?: string }) {
  const group = await prisma.groupReservation.findUnique({ where: { id: input.groupId }, include: { charges: { where: { invoiceId: null, paidBy: input.paidBy } } } });
  if (!group) throw new AppError(404, "GRP-001", "Group reservation not found");
  if (group.charges.length === 0) throw new AppError(400, "GRP-022", "There are no uninvoiced master charges");
  const invoice = await prisma.$transaction(async (tx) => {
    const amount = group.charges.reduce((sum, charge) => sum + Number(charge.amount), 0);
    const created = await tx.groupInvoice.create({ data: { groupReservationId: group.id, invoiceType: input.invoiceType.trim(), amount, outstanding: amount } });
    await tx.groupCharge.updateMany({ where: { id: { in: group.charges.map((charge) => charge.id) } }, data: { invoiceId: created.id } });
    return created;
  });
  await writeAuditLog({ userId: input.userId, module: "GroupReservations", action: "GROUP_INVOICE_CREATE", entityType: "GroupInvoice", entityId: invoice.id, details: { amount: Number(invoice.amount) }, ipAddress: input.ipAddress });
  return invoice;
}

export async function recordGroupPayment(input: { groupId: string; invoiceId?: string; type: "DEPOSIT" | "INVOICE_PAYMENT"; amount: number; paymentMethod: string; reference?: string; userId: string; ipAddress?: string }) {
  const group = await prisma.groupReservation.findUnique({ where: { id: input.groupId } });
  if (!group) throw new AppError(404, "GRP-001", "Group reservation not found");
  if (input.type === "INVOICE_PAYMENT" && !input.invoiceId) throw new AppError(400, "GRP-023", "Select an invoice for an invoice payment");
  const payment = await prisma.$transaction(async (tx) => {
    if (input.type === "INVOICE_PAYMENT") {
      const invoice = await tx.groupInvoice.findFirst({ where: { id: input.invoiceId, groupReservationId: group.id } });
      if (!invoice) throw new AppError(404, "GRP-024", "Group invoice not found");
      if (input.amount > Number(invoice.outstanding) + 0.001) throw new AppError(400, "GRP-025", "Payment exceeds invoice outstanding", { outstanding: Number(invoice.outstanding) });
      const remaining = Math.max(0, Number(invoice.outstanding) - input.amount);
      await tx.groupInvoice.update({ where: { id: invoice.id }, data: { outstanding: remaining, status: remaining <= 0.01 ? "PAID" : "PARTIAL" } });
    }
    const result = await tx.groupPayment.create({ data: { groupReservationId: group.id, invoiceId: input.invoiceId, type: input.type as GroupPaymentType, amount: input.amount, paymentMethod: input.paymentMethod, reference: input.reference?.trim() || undefined, createdById: input.userId } });
    if (input.type === "DEPOSIT") await tx.groupReservation.update({ where: { id: group.id }, data: { depositAmount: { increment: input.amount } } });
    await refreshGroupBalance(tx, group.id);
    return result;
  });
  await writeAuditLog({ userId: input.userId, module: "GroupReservations", action: input.type === "DEPOSIT" ? "GROUP_DEPOSIT_RECORD" : "GROUP_PAYMENT_RECORD", entityType: "GroupPayment", entityId: payment.id, details: { amount: input.amount, paymentMethod: input.paymentMethod, invoiceId: input.invoiceId }, ipAddress: input.ipAddress });
  return payment;
}

export async function closeGroupReservation(input: { groupId: string; userId: string; ipAddress?: string }) {
  const group = await prisma.groupReservation.findUnique({ where: { id: input.groupId }, include: { guests: true } });
  if (!group) throw new AppError(404, "GRP-001", "Group reservation not found");
  if (group.status !== GroupReservationStatus.CONFIRMED) throw new AppError(400, "GRP-026", "Only confirmed groups can be closed");
  const activeGuests = group.guests.filter((guest) => guest.checkInStatus !== "CHECKED_OUT");
  if (activeGuests.length) throw new AppError(400, "GRP-027", "All registered guests must check out before closing", { guestsNotCheckedOut: activeGuests.length });
  const balance = await refreshGroupBalance(prisma, group.id);
  if (Math.abs(balance) > 0.01) throw new AppError(400, "GRP-028", "Group balance must be settled before closing", { balance });
  const updated = await prisma.groupReservation.update({ where: { id: group.id }, data: { status: GroupReservationStatus.CLOSED } });
  await writeAuditLog({ userId: input.userId, module: "GroupReservations", action: "GROUP_CLOSE", entityType: "GroupReservation", entityId: group.id, ipAddress: input.ipAddress });
  return updated;
}

export async function checkOutGroupGuest(input: { groupId: string; reservationId: string; userId: string; ipAddress?: string }) {
  const reservation = await prisma.reservation.findFirst({ where: { id: input.reservationId, groupReservationId: input.groupId } });
  if (!reservation) throw new AppError(404, "GRP-029", "Reservation is not part of this group");
  return checkOutReservation({ reservationId: reservation.id, userId: input.userId, ipAddress: input.ipAddress });
}

export async function checkGroupAvailability(
  arrivalDate: string,
  departureDate: string,
  roomCount: number,
) {
  const arrival = toDateOnly(arrivalDate);
  const departure = toDateOnly(departureDate);

  const roomTypes = await prisma.roomType.findMany({
    include: { rooms: { where: { isActive: true } } },
  });

  const blockedByGroups = await prisma.groupRoom.findMany({
    where: {
      groupReservation: {
        status: { in: ["TENTATIVE", "CONFIRMED"] },
        arrivalDate: { lt: departure },
        departureDate: { gt: arrival },
      },
    },
    select: { roomId: true },
  });
  const blockedIds = new Set(blockedByGroups.map((b) => b.roomId));

  const overlappingReservations = await prisma.reservation.findMany({
    where: {
      roomId: { not: null },
      status: { in: ["CONFIRMED", "CHECKED_IN", "TENTATIVE"] },
      checkInDate: { lt: departure },
      checkOutDate: { gt: arrival },
    },
    select: { roomId: true },
  });
  overlappingReservations.forEach((r) => {
    if (r.roomId) blockedIds.add(r.roomId);
  });

  const availableByType = roomTypes.map((rt) => ({
    roomTypeId: rt.id,
    code: rt.code,
    name: rt.name,
    available: rt.rooms.filter((r) => !blockedIds.has(r.id)).length,
    baseRate: rt.baseRate,
  }));

  const totalAvailable = availableByType.reduce((s, t) => s + t.available, 0);

  return {
    requested: roomCount,
    totalAvailable,
    sufficient: totalAvailable >= roomCount,
    byRoomType: availableByType,
  };
}

export async function checkInGroupGuest(input: {
  groupId: string;
  guestId: string;
  roomId?: string;
  userId: string;
  ipAddress?: string;
}) {
  const group = await prisma.groupReservation.findUnique({
    where: { id: input.groupId },
    include: {
      guests: { where: { id: input.guestId } },
      roomAllocations: { include: { room: true, roomType: true } },
    },
  });

  if (!group) {
    throw new AppError(404, "GRP-001", "Group reservation not found");
  }
  if (group.status !== GroupReservationStatus.CONFIRMED) {
    throw new AppError(400, "GRP-014", "Group must be confirmed before check-in");
  }

  const groupGuest = group.guests[0];
  if (!groupGuest) {
    throw new AppError(404, "GRP-015", "Group guest not found");
  }
  if (groupGuest.checkInStatus !== "PENDING") {
    throw new AppError(400, "GRP-016", "Guest is already checked in or checked out");
  }

  const hasId = groupGuest.nationalId || groupGuest.passportNumber;
  if (!hasId) {
    throw new AppError(400, "GRP-017", "National ID or passport required before check-in");
  }

  const allocation = await resolveGroupGuestRoom(
    input.groupId,
    groupGuest,
    input.roomId,
  );

  const room = allocation.room;
  if (room.status !== RoomStatus.INSPECTED) {
    throw new AppError(400, "GRP-018", "Room must be INSPECTED before check-in");
  }

  await checkRoomOverlap(room.id, group.arrivalDate, group.departureDate);

  const ratePlan = await prisma.ratePlan.findFirst({
    where: { roomTypeId: allocation.roomTypeId, isActive: true },
  });
  if (!ratePlan) {
    throw new AppError(404, "GRP-019", "No active rate plan for room type");
  }

  const reservationNumber = await nextDocumentNumber("RESERVATIONS");
  const { firstName, lastName } = splitFullName(groupGuest.fullName);
  const email = guestEmailFromGroup(group.groupCode, groupGuest.id);

  const result = await prisma.$transaction(async (tx) => {
    const guest = await tx.guest.create({
      data: {
        firstName,
        lastName,
        email,
        nationality: groupGuest.nationality,
        nationalId: groupGuest.nationalId,
        passportNumber: groupGuest.passportNumber,
        vipStatus: groupGuest.vipStatus,
        notes: groupGuest.notes,
      },
    });

    const reservation = await tx.reservation.create({
      data: {
        reservationNumber,
        guestId: guest.id,
        ratePlanId: ratePlan.id,
        roomId: room.id,
        checkInDate: group.arrivalDate,
        checkOutDate: group.departureDate,
        adults: 1,
        children: 0,
        status: ReservationStatus.CHECKED_IN,
        groupReservationId: group.id,
        createdById: input.userId,
      },
      include: {
        guest: true,
        room: { include: { roomType: true } },
        ratePlan: true,
      },
    });

    await tx.reservationStatusHistory.create({
      data: {
        reservationId: reservation.id,
        oldStatus: null,
        newStatus: ReservationStatus.CHECKED_IN,
        changedById: input.userId,
        changeReason: "Group guest checked in",
      },
    });

    await tx.folio.create({
      data: { reservationId: reservation.id, guestId: guest.id },
    });

    await tx.room.update({
      where: { id: room.id },
      data: { status: RoomStatus.OCCUPIED },
    });

    await tx.groupGuest.update({
      where: { id: groupGuest.id },
      data: {
        reservationId: reservation.id,
        roomNumber: room.number,
        checkInStatus: "CHECKED_IN",
      },
    });

    await tx.groupRoom.update({
      where: { id: allocation.id },
      data: {
        status: GroupRoomAllocationStatus.ALLOCATED,
        assignedGuestName: groupGuest.fullName,
      },
    });

    return { reservation, guest, roomNumber: room.number };
  });

  await writeAuditLog({
    userId: input.userId,
    module: "GroupReservations",
    action: "GROUP_GUEST_CHECKIN",
    entityType: "GroupGuest",
    entityId: groupGuest.id,
    details: {
      reservationNumber,
      roomNumber: result.roomNumber,
      guestName: groupGuest.fullName,
    },
    ipAddress: input.ipAddress,
  });

  return result;
}

export async function assignGroupGuestRoom(input: {
  groupId: string;
  guestId: string;
  roomId: string | null;
  userId: string;
  ipAddress?: string;
}) {
  const [group, guest] = await Promise.all([
    prisma.groupReservation.findUnique({ where: { id: input.groupId } }),
    prisma.groupGuest.findFirst({ where: { id: input.guestId, groupReservationId: input.groupId } }),
  ]);
  if (!group) throw new AppError(404, "GRP-001", "Group reservation not found");
  if (!guest) throw new AppError(404, "GRP-015", "Group guest not found");
  if (guest.checkInStatus !== "PENDING") throw new AppError(400, "GRP-030", "Room assignments can only be changed before check-in");
  if (group.status === GroupReservationStatus.CLOSED || group.status === GroupReservationStatus.CANCELLED) {
    throw new AppError(400, "GRP-031", "Rooms cannot be assigned to a closed or cancelled group");
  }

  const allocation = input.roomId
    ? await prisma.groupRoom.findFirst({ where: { groupReservationId: group.id, roomId: input.roomId }, include: { room: true } })
    : null;
  if (input.roomId && !allocation) throw new AppError(400, "GRP-011", "Selected room is not allocated to this group");
  if (allocation) {
    const otherGuest = await prisma.groupGuest.findFirst({
      where: { groupReservationId: group.id, id: { not: guest.id }, roomNumber: allocation.room.number, checkInStatus: { not: "CHECKED_OUT" } },
    });
    if (otherGuest) throw new AppError(409, "GRP-032", `Room ${allocation.room.number} is already assigned to ${otherGuest.fullName}`);
  }

  await prisma.$transaction(async (tx) => {
    const oldAllocations = await tx.groupRoom.findMany({ where: { groupReservationId: group.id, assignedGuestName: guest.fullName } });
    if (oldAllocations.length) await tx.groupRoom.updateMany({ where: { id: { in: oldAllocations.map((old) => old.id) } }, data: { assignedGuestName: null } });
    await tx.groupGuest.update({ where: { id: guest.id }, data: { roomNumber: allocation?.room.number ?? null } });
    if (allocation) await tx.groupRoom.update({ where: { id: allocation.id }, data: { assignedGuestName: guest.fullName } });
  });

  await writeAuditLog({
    userId: input.userId,
    module: "GroupReservations",
    action: "GROUP_GUEST_ROOM_ASSIGN",
    entityType: "GroupGuest",
    entityId: guest.id,
    details: { groupCode: group.groupCode, fullName: guest.fullName, roomNumber: allocation?.room.number ?? null },
    ipAddress: input.ipAddress,
  });
  return { guestId: guest.id, roomNumber: allocation?.room.number ?? null };
}

export async function checkInAllGroupGuests(input: {
  groupId: string;
  userId: string;
  ipAddress?: string;
}) {
  const group = await prisma.groupReservation.findUnique({
    where: { id: input.groupId },
    include: { guests: true },
  });

  if (!group) {
    throw new AppError(404, "GRP-001", "Group reservation not found");
  }
  if (group.status !== GroupReservationStatus.CONFIRMED) {
    throw new AppError(400, "GRP-014", "Group must be confirmed before check-in");
  }

  const pending = group.guests.filter((g) => g.checkInStatus === "PENDING");
  const results: { guestId: string; fullName: string; success: boolean; error?: string; reservationId?: string }[] = [];

  for (const guest of pending) {
    try {
      const result = await checkInGroupGuest({
        groupId: input.groupId,
        guestId: guest.id,
        userId: input.userId,
        ipAddress: input.ipAddress,
      });
      results.push({
        guestId: guest.id,
        fullName: guest.fullName,
        success: true,
        reservationId: result.reservation.id,
      });
    } catch (error) {
      const message = error instanceof AppError ? error.message : "Check-in failed";
      results.push({
        guestId: guest.id,
        fullName: guest.fullName,
        success: false,
        error: message,
      });
    }
  }

  await writeAuditLog({
    userId: input.userId,
    module: "GroupReservations",
    action: "GROUP_BULK_CHECKIN",
    entityType: "GroupReservation",
    entityId: input.groupId,
    details: {
      total: pending.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    },
    ipAddress: input.ipAddress,
  });

  return {
    total: pending.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}
