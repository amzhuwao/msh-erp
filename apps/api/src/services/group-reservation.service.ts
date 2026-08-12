import { GroupReservationStatus, GroupRoomAllocationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { nextDocumentNumber, writeAuditLog } from "./system.service.js";
import { checkRoomOverlap } from "./reservation.service.js";

function toDateOnly(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function getGroupDashboard() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

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
      createdById: input.createdById,
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
  nationality?: string;
  nationalId?: string;
  passportNumber?: string;
  roomTypeCode?: string;
  vipStatus?: "NONE" | "VIP1" | "VIP2" | "VIP3";
  notes?: string;
  userId: string;
}) {
  const group = await prisma.groupReservation.findUnique({ where: { id: input.groupId } });
  if (!group) {
    throw new AppError(404, "GRP-001", "Group reservation not found");
  }

  return prisma.groupGuest.create({
    data: {
      groupReservationId: input.groupId,
      fullName: input.fullName,
      nationality: input.nationality,
      nationalId: input.nationalId,
      passportNumber: input.passportNumber,
      roomTypeCode: input.roomTypeCode,
      vipStatus: input.vipStatus ?? "NONE",
      notes: input.notes,
    },
  });
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
    include: { charges: true, invoices: true },
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
  };
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
