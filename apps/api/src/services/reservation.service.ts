import { BookingSource, ReservationStatus, RoomStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { nextDocumentNumber, writeAuditLog } from "./system.service.js";
import { assertGuestIdentity } from "../lib/identity.js";
import { utcToday } from "../lib/tax.js";

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
  source?: BookingSource;
  createdById: string;
  ipAddress?: string;
}) {
  const checkIn = toDateOnly(input.checkInDate);
  const checkOut = toDateOnly(input.checkOutDate);

  if (checkIn >= checkOut) {
    throw new AppError(400, "RES-002", "Check-in date must be before check-out date");
  }

  const guest = await prisma.guest.findUnique({ where: { id: input.guestId } });
  if (!guest) {
    throw new AppError(404, "GST-001", "Guest not found");
  }
  assertGuestIdentity(guest);

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
  const source = input.source ?? BookingSource.WALK_IN;

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
        source,
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
        changeReason: source === BookingSource.ONLINE ? "Online booking" : "Reservation created",
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
    details: { reservationNumber, source },
    ipAddress: input.ipAddress,
  });

  if (source === BookingSource.ONLINE) {
    const { notifyReceptionOfOnlineBooking } = await import("./notification.service.js");
    await notifyReceptionOfOnlineBooking(reservation);
  }

  return reservation;
}

export async function checkInReservation(input: {
  reservationId: string;
  roomId: string;
  nationality?: string;
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

  const stayDate = toDateOnly(reservation.checkInDate);
  const today = utcToday();
  if (today.getTime() < stayDate.getTime()) {
    throw new AppError(
      400,
      "RES-014",
      `Check-in is only allowed on the reservation date (${stayDate.toISOString().slice(0, 10)})`,
    );
  }

  assertGuestIdentity({
    nationality: reservation.guest.nationality,
    nationalId: input.nationalId || reservation.guest.nationalId,
    passportNumber: input.passportNumber || reservation.guest.passportNumber,
  });

  const room = await prisma.room.findUnique({ where: { id: input.roomId } });
  if (!room) {
    throw new AppError(404, "RES-008", "Room not found");
  }

  if (room.status !== RoomStatus.INSPECTED) {
    throw new AppError(400, "RES-009", "Room must be INSPECTED before check-in");
  }

  await checkRoomOverlap(input.roomId, reservation.checkInDate, reservation.checkOutDate, reservation.id);

  const updated = await prisma.$transaction(async (tx) => {
  if (input.nationalId || input.passportNumber || input.nationality) {
      await tx.guest.update({
        where: { id: reservation.guestId },
        data: {
          nationalId: input.nationalId ?? reservation.guest.nationalId,
          passportNumber: input.passportNumber ?? reservation.guest.passportNumber,
          nationality: input.nationality ?? reservation.guest.nationality,
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

export async function recheckInReservation(input: {
  reservationId: string;
  roomId?: string;
  userId: string;
  ipAddress?: string;
}) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: input.reservationId },
    include: { guest: true, room: true, folios: true },
  });

  if (!reservation) {
    throw new AppError(404, "RES-006", "Reservation not found");
  }
  if (reservation.status !== ReservationStatus.CHECKED_OUT) {
    throw new AppError(400, "RES-015", "Only checked-out reservations can be rechecked in");
  }

  assertGuestIdentity(reservation.guest);

  const roomId = input.roomId ?? reservation.roomId;
  if (!roomId) {
    throw new AppError(400, "RES-016", "A room is required to recheck in");
  }

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) {
    throw new AppError(404, "RES-008", "Room not found");
  }

  const occupiedByOther = await prisma.reservation.findFirst({
    where: {
      roomId,
      id: { not: reservation.id },
      status: ReservationStatus.CHECKED_IN,
    },
  });
  if (occupiedByOther) {
    throw new AppError(409, "RES-017", "Room is occupied by another in-house guest");
  }

  const today = utcToday();
  const checkOut = reservation.checkOutDate > today
    ? reservation.checkOutDate
    : new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        roomId,
        status: ReservationStatus.CHECKED_IN,
        checkOutDate: checkOut,
      },
      include: {
        guest: true,
        room: { include: { roomType: true } },
        ratePlan: true,
        folios: true,
      },
    });

    await tx.room.update({
      where: { id: roomId },
      data: { status: RoomStatus.OCCUPIED },
    });

    for (const folio of reservation.folios) {
      await tx.folio.update({
        where: { id: folio.id },
        data: { status: "OPEN" },
      });
    }

    await tx.reservationStatusHistory.create({
      data: {
        reservationId: reservation.id,
        oldStatus: reservation.status,
        newStatus: ReservationStatus.CHECKED_IN,
        changedById: input.userId,
        changeReason: "Guest rechecked in after checkout",
      },
    });

    return result;
  });

  await writeAuditLog({
    userId: input.userId,
    module: "Reservations",
    action: "RECHECK_IN",
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
