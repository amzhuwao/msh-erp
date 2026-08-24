import { ReservationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export async function getTapeChart(from: Date, days: number) {
  const rangeStart = startOfDay(from);
  const rangeEnd = addDays(rangeStart, days);

  const [rooms, reservations] = await Promise.all([
    prisma.room.findMany({
      where: { isActive: true },
      include: { roomType: true },
      orderBy: [{ floor: "asc" }, { number: "asc" }],
    }),
    prisma.reservation.findMany({
      where: {
        status: {
          in: [
            ReservationStatus.TENTATIVE,
            ReservationStatus.CONFIRMED,
            ReservationStatus.CHECKED_IN,
          ],
        },
        checkInDate: { lt: rangeEnd },
        checkOutDate: { gt: rangeStart },
      },
      include: {
        guest: true,
        room: true,
        ratePlan: true,
      },
    }),
  ]);

  const dates = Array.from({ length: days }, (_, i) => {
    const d = addDays(rangeStart, i);
    return d.toISOString().slice(0, 10);
  });

  return { dates, rooms, reservations };
}

export async function getArrivalsToday() {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);

  return prisma.reservation.findMany({
    where: {
      checkInDate: { gte: today, lt: tomorrow },
      status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.TENTATIVE] },
    },
    include: {
      guest: true,
      room: { include: { roomType: true } },
      ratePlan: true,
      folios: { include: { lines: true } },
    },
    orderBy: { guest: { lastName: "asc" } },
  });
}

export async function getDeparturesToday() {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);

  const reservations = await prisma.reservation.findMany({
    where: {
      checkOutDate: { gte: today, lt: tomorrow },
      status: ReservationStatus.CHECKED_IN,
    },
    include: {
      guest: true,
      room: true,
      folios: { include: { lines: true } },
    },
    orderBy: { room: { number: "asc" } },
  });

  return reservations.map((r) => ({
    ...r,
    folioBalance: r.folios.reduce((sum, folio) => {
      return (
        sum +
        folio.lines.reduce((lineSum, line) => {
          const amount = Number(line.amount);
          return line.lineType === "PAYMENT" ? lineSum - amount : lineSum + amount;
        }, 0)
      );
    }, 0),
  }));
}

export async function getInHouseGuests(search?: string) {
  const where: Record<string, unknown> = {
    status: ReservationStatus.CHECKED_IN,
  };

  if (search) {
    where.OR = [
      { guest: { firstName: { contains: search, mode: "insensitive" } } },
      { guest: { lastName: { contains: search, mode: "insensitive" } } },
      { room: { number: { contains: search, mode: "insensitive" } } },
    ];
  }

  return prisma.reservation.findMany({
    where,
    include: {
      guest: true,
      room: { include: { roomType: true } },
      ratePlan: true,
      folios: { select: { id: true } },
    },
    orderBy: { room: { number: "asc" } },
  });
}

export async function getRecentCheckouts() {
  const from = addDays(startOfDay(new Date()), -14);
  return prisma.reservation.findMany({
    where: {
      status: ReservationStatus.CHECKED_OUT,
      updatedAt: { gte: from },
    },
    include: {
      guest: true,
      room: { include: { roomType: true } },
      folios: { select: { id: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
}
