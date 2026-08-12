import { ReservationStatus, RoomStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { nextDocumentNumber, writeAuditLog } from "./system.service.js";

function toDateOnly(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function checkRoomOverlap(
  roomId: string,
  checkIn: Date,
  checkOut: Date,
  excludeReservationId?: string,
) {
  const overlap = await prisma.reservation.findFirst({
    where: {
      roomId,
      id: excludeReservationId ? { not: excludeReservationId } : undefined,
      status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.CHECKED_IN, ReservationStatus.TENTATIVE] },
      checkInDate: { lt: checkOut },
      checkOutDate: { gt: checkIn },
    },
  });

  if (overlap) {
    throw new AppError(409, "RES-001", "Room is already allocated for the selected dates");
  }
}

export async function searchAvailability(checkIn: Date, checkOut: Date, adults = 1) {
  if (checkIn >= checkOut) {
    throw new AppError(400, "RES-002", "Check-in date must be before check-out date");
  }

  const roomTypes = await prisma.roomType.findMany({
    include: {
      rooms: {
        where: {
          isActive: true,
          status: { in: [RoomStatus.INSPECTED, RoomStatus.VACANT_CLEAN] },
        },
      },
      ratePlans: { where: { isActive: true }, take: 1 },
    },
  });

  const overlapping = await prisma.reservation.findMany({
    where: {
      roomId: { not: null },
      status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.CHECKED_IN, ReservationStatus.TENTATIVE] },
      checkInDate: { lt: checkOut },
      checkOutDate: { gt: checkIn },
    },
    select: { roomId: true },
  });

  const blockedRoomIds = new Set(overlapping.map((r) => r.roomId).filter(Boolean) as string[]);

  return roomTypes
    .filter((rt) => rt.maxAdults >= adults && rt.ratePlans.length > 0)
    .map((rt) => {
      const availableRooms = rt.rooms.filter((room) => !blockedRoomIds.has(room.id));
      return {
        roomTypeId: rt.id,
        code: rt.code,
        name: rt.name,
        maxAdults: rt.maxAdults,
        maxChildren: rt.maxChildren,
        availableCount: availableRooms.length,
        ratePlanId: rt.ratePlans[0]!.id,
        nightlyRate: rt.ratePlans[0]!.baseRate,
        sampleRoomIds: availableRooms.slice(0, 5).map((r) => r.id),
      };
    })
    .filter((item) => item.availableCount > 0);
}

export async function createReservation(input: {
  guestId: string;
  ratePlanId: string;
  roomId?: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  specialRequests?: string;
  createdById: string;
  ipAddress?: string;
}) {
  const checkIn = toDateOnly(input.checkInDate);
  const checkOut = toDateOnly(input.checkOutDate);

  if (checkIn >= checkOut) {
    throw new AppError(400, "RES-002", "Check-in date must be before check-out date");
  }

  const ratePlan = await prisma.ratePlan.findUnique({
    where: { id: input.ratePlanId },
    include: { roomType: true },
  });
  if (!ratePlan?.isActive) {
    throw new AppError(404, "RES-003", "Rate plan not found");
  }

  if (input.adults > ratePlan.roomType.maxAdults) {
    throw new AppError(400, "RES-004", "Adult count exceeds room type capacity");
  }

  if (input.roomId) {
    const room = await prisma.room.findUnique({ where: { id: input.roomId } });
    if (!room || room.roomTypeId !== ratePlan.roomTypeId) {
      throw new AppError(400, "RES-005", "Selected room does not match rate plan room type");
    }
    await checkRoomOverlap(input.roomId, checkIn, checkOut);
  }

  const reservationNumber = await nextDocumentNumber("RESERVATIONS");

  const reservation = await prisma.$transaction(async (tx) => {
    const created = await tx.reservation.create({
      data: {
        reservationNumber,
        guestId: input.guestId,
        ratePlanId: input.ratePlanId,
        roomId: input.roomId,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        adults: input.adults,
        children: input.children,
        specialRequests: input.specialRequests,
        status: ReservationStatus.CONFIRMED,
        createdById: input.createdById,
      },
      include: {
        guest: true,
        ratePlan: { include: { roomType: true } },
        room: true,
      },
    });

    await tx.reservationStatusHistory.create({
      data: {
        reservationId: created.id,
        oldStatus: null,
        newStatus: ReservationStatus.CONFIRMED,
        changedById: input.createdById,
        changeReason: "Reservation created",
      },
    });

    await tx.folio.create({
      data: {
        reservationId: created.id,
        guestId: input.guestId,
      },
    });

    return created;
  });

  await writeAuditLog({
    userId: input.createdById,
    module: "Reservations",
    action: "RESERVATION_CREATE",
    entityType: "Reservation",
    entityId: reservation.id,
    details: { reservationNumber },
    ipAddress: input.ipAddress,
  });

  return reservation;
}

export async function checkInReservation(input: {
  reservationId: string;
  roomId: string;
  nationalId?: string;
  passportNumber?: string;
  userId: string;
  ipAddress?: string;
}) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: input.reservationId },
    include: { guest: true, room: true },
  });

  if (!reservation) {
    throw new AppError(404, "RES-006", "Reservation not found");
  }

  if (!([ReservationStatus.CONFIRMED, ReservationStatus.TENTATIVE] as ReservationStatus[]).includes(reservation.status)) {
    throw new AppError(400, "RES-007", "Reservation is not eligible for check-in");
  }

  const room = await prisma.room.findUnique({ where: { id: input.roomId } });
  if (!room) {
    throw new AppError(404, "RES-008", "Room not found");
  }

  if (room.status !== RoomStatus.INSPECTED) {
    throw new AppError(400, "RES-009", "Room must be INSPECTED before check-in");
  }

  await checkRoomOverlap(input.roomId, reservation.checkInDate, reservation.checkOutDate, reservation.id);

  const hasId = input.nationalId || input.passportNumber ||
    reservation.guest.nationalId || reservation.guest.passportNumber;

  if (!hasId) {
    throw new AppError(400, "RES-010", "National ID or passport required before check-in");
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.nationalId || input.passportNumber) {
      await tx.guest.update({
        where: { id: reservation.guestId },
        data: {
          nationalId: input.nationalId ?? reservation.guest.nationalId,
          passportNumber: input.passportNumber ?? reservation.guest.passportNumber,
        },
      });
    }

    const result = await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        roomId: input.roomId,
        status: ReservationStatus.CHECKED_IN,
      },
      include: {
        guest: true,
        room: { include: { roomType: true } },
        ratePlan: true,
      },
    });

    await tx.room.update({
      where: { id: input.roomId },
      data: { status: RoomStatus.OCCUPIED },
    });

    await tx.reservationStatusHistory.create({
      data: {
        reservationId: reservation.id,
        oldStatus: reservation.status,
        newStatus: ReservationStatus.CHECKED_IN,
        changedById: input.userId,
        changeReason: "Guest checked in",
      },
    });

    return result;
  });

  await writeAuditLog({
    userId: input.userId,
    module: "Reservations",
    action: "CHECK_IN",
    entityType: "Reservation",
    entityId: reservation.id,
    ipAddress: input.ipAddress,
  });

  return updated;
}

export async function cancelReservation(input: {
  reservationId: string;
  reason: string;
  userId: string;
  ipAddress?: string;
}) {
  const reservation = await prisma.reservation.findUnique({ where: { id: input.reservationId } });
  if (!reservation) {
    throw new AppError(404, "RES-006", "Reservation not found");
  }

  if (([ReservationStatus.CHECKED_OUT, ReservationStatus.CANCELLED] as ReservationStatus[]).includes(reservation.status)) {
    throw new AppError(400, "RES-011", "Reservation cannot be cancelled");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        status: ReservationStatus.CANCELLED,
        cancellationReason: input.reason,
        roomId: reservation.status === ReservationStatus.CHECKED_IN ? null : reservation.roomId,
      },
      include: { guest: true, room: true, ratePlan: true },
    });

    if (reservation.roomId && reservation.status === ReservationStatus.CHECKED_IN) {
      await tx.room.update({
        where: { id: reservation.roomId },
        data: { status: RoomStatus.OCCUPIED_DIRTY },
      });
    }

    await tx.reservationStatusHistory.create({
      data: {
        reservationId: reservation.id,
        oldStatus: reservation.status,
        newStatus: ReservationStatus.CANCELLED,
        changedById: input.userId,
        changeReason: input.reason,
      },
    });

    return result;
  });

  await writeAuditLog({
    userId: input.userId,
    module: "Reservations",
    action: "RESERVATION_CANCEL",
    entityType: "Reservation",
    entityId: reservation.id,
    details: { reason: input.reason },
    ipAddress: input.ipAddress,
  });

  return updated;
}
