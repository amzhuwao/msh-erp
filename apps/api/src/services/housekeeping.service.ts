import { RoomStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { writeAuditLog } from "./system.service.js";

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

export async function getHousekeepingDashboard() {
  const rooms = await prisma.room.findMany({
    where: { isActive: true },
    include: {
      roomType: true,
      reservations: {
        where: { status: "CHECKED_IN" },
        take: 1,
        include: { guest: true },
      },
    },
    orderBy: [{ floor: "asc" }, { number: "asc" }],
  });

  const byStatus = rooms.reduce<Record<string, number>>((acc, room) => {
    acc[room.status] = (acc[room.status] ?? 0) + 1;
    return acc;
  }, {});

  return { rooms, summary: byStatus, total: rooms.length };
}

export async function updateRoomStatus(input: {
  roomId: string;
  status: RoomStatus;
  userId: string;
  roleName: string;
  notes?: string;
  ipAddress?: string;
}) {
  const room = await prisma.room.findUnique({ where: { id: input.roomId } });
  if (!room) {
    throw new AppError(404, "HK-001", "Room not found");
  }

  const isSupervisor =
    input.roleName.includes("Supervisor") || input.roleName.includes("Administrator");

  const allowedMap = isSupervisor ? SUPERVISOR_ALLOWED : ATTENDANT_ALLOWED;
  const allowed = allowedMap[room.status] ?? [];

  if (!allowed.includes(input.status)) {
    throw new AppError(
      400,
      "HK-002",
      `Cannot transition room from ${room.status} to ${input.status}`,
    );
  }

  const updated = await prisma.room.update({
    where: { id: input.roomId },
    data: { status: input.status },
    include: { roomType: true },
  });

  await writeAuditLog({
    userId: input.userId,
    module: "Housekeeping",
    action: "ROOM_STATUS_CHANGE",
    entityType: "Room",
    entityId: room.id,
    details: {
      previousStatus: room.status,
      newStatus: input.status,
      notes: input.notes,
    },
    ipAddress: input.ipAddress,
  });

  return updated;
}

export async function bulkAssignRooms(input: {
  roomIds: string[];
  attendantUserId: string;
  date: string;
  userId: string;
}) {
  const date = new Date(input.date);
  const assignments = await prisma.housekeepingAssignment.createMany({
    data: input.roomIds.map((roomId) => ({
      date,
      roomId,
      attendantUserId: input.attendantUserId,
    })),
    skipDuplicates: true,
  });

  await writeAuditLog({
    userId: input.userId,
    module: "Housekeeping",
    action: "ROOM_ASSIGNMENT",
    details: { roomIds: input.roomIds, attendantUserId: input.attendantUserId },
  });

  return { assigned: assignments.count };
}
