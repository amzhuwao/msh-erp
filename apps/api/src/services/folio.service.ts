import { FolioLineType, FolioStatus, ReservationStatus, RoomStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { writeAuditLog } from "./system.service.js";

export function calculateFolioBalance(
  lines: { lineType: FolioLineType; amount: { toString(): string } }[],
): number {
  return lines.reduce((sum, line) => {
    const amount = Number(line.amount);
    if (line.lineType === FolioLineType.PAYMENT) {
      return sum - amount;
    }
    return sum + amount;
  }, 0);
}

export async function getFolioWithBalance(folioId: string) {
  const folio = await prisma.folio.findUnique({
    where: { id: folioId },
    include: {
      lines: { orderBy: { createdAt: "asc" } },
      guest: true,
      reservation: { include: { room: true } },
    },
  });

  if (!folio) {
    throw new AppError(404, "FOL-001", "Folio not found");
  }

  return {
    ...folio,
    balance: calculateFolioBalance(folio.lines),
  };
}

export async function postFolioCharge(input: {
  folioId: string;
  description: string;
  amount: number;
  userId: string;
  ipAddress?: string;
}) {
  const folio = await prisma.folio.findUnique({ where: { id: input.folioId } });
  if (!folio) {
    throw new AppError(404, "FOL-001", "Folio not found");
  }
  if (folio.status === FolioStatus.CLOSED) {
    throw new AppError(400, "FOL-002", "Cannot post charges to a closed folio");
  }

  const line = await prisma.folioLine.create({
    data: {
      folioId: input.folioId,
      lineType: FolioLineType.CHARGE,
      description: input.description,
      amount: input.amount,
      postedById: input.userId,
    },
  });

  await writeAuditLog({
    userId: input.userId,
    module: "Reservations",
    action: "FOLIO_CHARGE_POST",
    entityType: "Folio",
    entityId: input.folioId,
    details: { description: input.description, amount: input.amount },
    ipAddress: input.ipAddress,
  });

  return line;
}

export async function postFolioPayment(input: {
  folioId: string;
  description: string;
  amount: number;
  userId: string;
  ipAddress?: string;
}) {
  const folio = await prisma.folio.findUnique({
    where: { id: input.folioId },
    include: { lines: true },
  });
  if (!folio) {
    throw new AppError(404, "FOL-001", "Folio not found");
  }
  if (folio.status === FolioStatus.CLOSED) {
    throw new AppError(400, "FOL-002", "Cannot post payments to a closed folio");
  }

  const line = await prisma.folioLine.create({
    data: {
      folioId: input.folioId,
      lineType: FolioLineType.PAYMENT,
      description: input.description,
      amount: input.amount,
      postedById: input.userId,
    },
  });

  await writeAuditLog({
    userId: input.userId,
    module: "Reservations",
    action: "PAYMENT_RECORD",
    entityType: "Folio",
    entityId: input.folioId,
    details: { description: input.description, amount: input.amount },
    ipAddress: input.ipAddress,
  });

  return line;
}

export async function checkOutReservation(input: {
  reservationId: string;
  userId: string;
  ipAddress?: string;
}) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: input.reservationId },
    include: {
      folios: { include: { lines: true } },
      room: true,
    },
  });

  if (!reservation) {
    throw new AppError(404, "RES-006", "Reservation not found");
  }
  if (reservation.status !== ReservationStatus.CHECKED_IN) {
    throw new AppError(400, "RES-012", "Only checked-in reservations can be checked out");
  }

  const totalBalance = reservation.folios.reduce(
    (sum, folio) => sum + calculateFolioBalance(folio.lines),
    0,
  );

  if (Math.abs(totalBalance) > 0.01) {
    throw new AppError(400, "RES-013", "Folio must be settled before check-out", {
      balance: totalBalance,
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.reservation.update({
      where: { id: reservation.id },
      data: { status: ReservationStatus.CHECKED_OUT },
      include: { guest: true, room: true, folios: true },
    });

    if (reservation.roomId) {
      await tx.room.update({
        where: { id: reservation.roomId },
        data: { status: RoomStatus.OCCUPIED_DIRTY },
      });
    }

    for (const folio of reservation.folios) {
      await tx.folio.update({
        where: { id: folio.id },
        data: { status: FolioStatus.SETTLED },
      });
    }

    await tx.reservationStatusHistory.create({
      data: {
        reservationId: reservation.id,
        oldStatus: reservation.status,
        newStatus: ReservationStatus.CHECKED_OUT,
        changedById: input.userId,
        changeReason: "Guest checked out",
      },
    });

    return result;
  });

  await writeAuditLog({
    userId: input.userId,
    module: "Reservations",
    action: "CHECK_OUT",
    entityType: "Reservation",
    entityId: reservation.id,
    ipAddress: input.ipAddress,
  });

  return updated;
}

export async function runNightAudit(userId: string, ipAddress?: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [pendingDepartures, pendingArrivals, inHouse] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        checkOutDate: { lte: today },
        status: ReservationStatus.CHECKED_IN,
      },
      include: { guest: true, room: true },
    }),
    prisma.reservation.findMany({
      where: {
        checkInDate: { lte: today },
        status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.TENTATIVE] },
      },
      include: { guest: true },
    }),
    prisma.reservation.findMany({
      where: { status: ReservationStatus.CHECKED_IN },
      include: {
        folios: true,
        ratePlan: true,
        guest: true,
        room: true,
      },
    }),
  ]);

  const noShows = await prisma.$transaction(async (tx) => {
    const marked = [];
    for (const reservation of pendingArrivals) {
      const updated = await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.NO_SHOW },
      });
      await tx.reservationStatusHistory.create({
        data: {
          reservationId: reservation.id,
          oldStatus: reservation.status,
          newStatus: ReservationStatus.NO_SHOW,
          changedById: userId,
          changeReason: "Night audit — no show",
        },
      });
      marked.push(updated);
    }

    let roomChargesPosted = 0;
    for (const reservation of inHouse) {
      const folio = reservation.folios[0];
      if (!folio) continue;

      const nightlyRate = Number(reservation.ratePlan.baseRate);
      await tx.folioLine.create({
        data: {
          folioId: folio.id,
          lineType: FolioLineType.CHARGE,
          description: `Room charge — ${today.toISOString().slice(0, 10)}`,
          amount: nightlyRate,
          postedById: userId,
        },
      });
      roomChargesPosted += 1;
    }

    return { noShowCount: marked.length, roomChargesPosted };
  });

  await writeAuditLog({
    userId,
    module: "Reservations",
    action: "NIGHT_AUDIT_RUN",
    details: {
      pendingDepartures: pendingDepartures.length,
      noShows: noShows.noShowCount,
      roomChargesPosted: noShows.roomChargesPosted,
    },
    ipAddress,
  });

  return {
    businessDate: today.toISOString().slice(0, 10),
    exceptions: {
      pendingDepartures,
      pendingArrivals: pendingArrivals.length,
    },
    actions: noShows,
  };
}
