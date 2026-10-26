import { FolioLineType, FolioStatus, Prisma, PrismaClient, ReservationStatus, RoomStatus } from "@prisma/client";

const prisma = new PrismaClient();
const seedMarker = "[three-month-demo-seed-2026]";
const reservationPrefix = "DEMO-3M-2026-";

function utcDate(day: Date, offset = 0) {
  const result = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  result.setUTCDate(result.getUTCDate() + offset);
  return result;
}

function dateKey(day: Date) {
  return day.toISOString().slice(0, 10).replaceAll("-", "");
}

function cents(amount: number) {
  return Math.round(amount * 100) / 100;
}

async function main() {
  const today = utcDate(new Date());
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 3, today.getUTCDate()));
  const [users, rooms, ratePlans, property] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, select: { id: true }, orderBy: { createdAt: "asc" } }),
    prisma.room.findMany({
      where: { isActive: true, status: { notIn: [RoomStatus.OUT_OF_ORDER, RoomStatus.OUT_OF_SERVICE, RoomStatus.MAINTENANCE] } },
      include: { roomType: true },
      orderBy: { number: "asc" },
    }),
    prisma.ratePlan.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    prisma.propertyConfiguration.findFirst({ select: { vatRatePercent: true, ztaLevyRatePercent: true } }),
  ]);

  if (!users.length || !rooms.length || !ratePlans.length) {
    throw new Error("Seed prerequisite missing: create at least one active user, room, and rate plan first.");
  }

  const vatRate = Number(property?.vatRatePercent ?? 15) / 100;
  const levyRate = Number(property?.ztaLevyRatePercent ?? 2) / 100;
  const existing = await prisma.reservation.findMany({
    where: { status: { notIn: [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW] } },
    select: { roomId: true, checkInDate: true, checkOutDate: true },
  });
  const occupied = new Map<string, Array<{ start: Date; end: Date }>>();
  for (const reservation of existing) {
    if (reservation.roomId) {
      const items = occupied.get(reservation.roomId) ?? [];
      items.push({ start: reservation.checkInDate, end: reservation.checkOutDate });
      occupied.set(reservation.roomId, items);
    }
  }

  const tax = (amount: number, department: string) => {
    const net = cents(amount / (1 + vatRate));
    return {
      amount: new Prisma.Decimal(cents(amount)),
      taxRate: new Prisma.Decimal(vatRate),
      netAmount: new Prisma.Decimal(net),
      vatAmount: new Prisma.Decimal(cents(amount - net)),
      levyAmount: new Prisma.Decimal(department === "ROOMS" ? cents(net * levyRate) : 0),
    };
  };

  let insertedReservations = 0;
  let insertedFolios = 0;
  let insertedFolioLines = 0;
  let skipped = 0;
  const dayCount = Math.floor((today.getTime() - start.getTime()) / 86_400_000) + 1;

  // Create one stay per day through the three-month window. Each stay has a
  // deterministic reservation number, making this script safe to run again.
  for (let dayOffset = 0; dayOffset < dayCount; dayOffset += 1) {
    const checkIn = utcDate(start, dayOffset);
    const reservationNumber = `${reservationPrefix}${dateKey(checkIn)}`;
    if (await prisma.reservation.findUnique({ where: { reservationNumber }, select: { id: true } })) {
      skipped += 1;
      continue;
    }

    const stayNights = 1 + ((dayOffset * 7 + 1) % 3);
    const checkOut = utcDate(checkIn, stayNights);
    const room = rooms.find((candidate) => !(occupied.get(candidate.id) ?? []).some((span) => checkIn < span.end && checkOut > span.start));
    const ratePlan = ratePlans.find((candidate) => candidate.roomTypeId === room?.roomTypeId) ?? ratePlans[dayOffset % ratePlans.length];
    const userId = users[dayOffset % users.length]!.id;
    const guestEmail = `demo.3m.${dateKey(checkIn)}@seed.msh.local`;
    const guest = await prisma.guest.upsert({
      where: { email: guestEmail },
      update: {},
      create: {
        firstName: ["Tariro", "Tendai", "Nyasha", "Kudakwashe", "Rudo", "Tinashe"][dayOffset % 6]!,
        lastName: ["Moyo", "Dube", "Ncube", "Chirwa", "Mupfumi", "Sibanda"][Math.floor(dayOffset / 2) % 6]!,
        email: guestEmail,
        phone: `+263 77 ${String(1000000 + dayOffset * 7919).slice(0, 7)}`,
        nationality: "Zimbabwean",
        notes: seedMarker,
        createdAt: utcDate(checkIn, -((dayOffset % 18) + 1)),
      },
    });

    const isFuture = checkIn > today;
    const isInHouse = !isFuture && checkOut > today;
    const status = isFuture ? ReservationStatus.CONFIRMED : isInHouse ? ReservationStatus.CHECKED_IN : ReservationStatus.CHECKED_OUT;
    const rate = Number(ratePlan.baseRate);
    const roomTotal = cents(rate * stayNights);
    const ancillaryCharge = dayOffset % 4 === 0 ? 18 : 0;
    const grossTotal = cents(roomTotal + ancillaryCharge);
    const paidRatio = isInHouse ? 0.35 : isFuture ? 0.25 : 1;
    const paidAmount = cents(grossTotal * paidRatio);
    const createdAt = isFuture ? utcDate(today, -((dayOffset % 10) + 1)) : utcDate(checkIn, -((dayOffset % 18) + 1));

    const reservation = await prisma.reservation.create({
      data: {
        reservationNumber,
        guestId: guest.id,
        ratePlanId: ratePlan.id,
        roomId: room?.id,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        adults: 1 + (dayOffset % 2),
        children: dayOffset % 7 === 0 ? 1 : 0,
        status,
        specialRequests: `${seedMarker} Sample stay for local development.`,
        source: dayOffset % 3 === 0 ? "ONLINE" : dayOffset % 3 === 1 ? "PHONE" : "WALK_IN",
        createdById: userId,
        contractedRate: new Prisma.Decimal(rate),
        createdAt,
        updatedAt: createdAt,
        statusHistory: { create: { newStatus: status, changedById: userId, changeReason: seedMarker, createdAt } },
      },
    });
    insertedReservations += 1;

    if (room && status !== ReservationStatus.CANCELLED && status !== ReservationStatus.NO_SHOW) {
      const spans = occupied.get(room.id) ?? [];
      spans.push({ start: checkIn, end: checkOut });
      occupied.set(room.id, spans);
    }

    const invoiceNumber = `INV-${reservationNumber}`;
    const folio = await prisma.folio.create({
      data: {
        reservationId: reservation.id,
        guestId: guest.id,
        status: isInHouse ? FolioStatus.OPEN : FolioStatus.SETTLED,
        invoiceNumber,
        createdAt,
        updatedAt: createdAt,
      },
    });
    insertedFolios += 1;

    const roomTax = tax(roomTotal, "ROOMS");
    await prisma.folioLine.create({
      data: {
        folioId: folio.id,
        lineType: FolioLineType.CHARGE,
        description: `Accommodation — ${stayNights} night${stayNights === 1 ? "" : "s"} at ${room?.number ?? "unassigned room"}`,
        department: "ROOMS",
        ...roomTax,
        createdAt: checkOut > today ? today : checkOut,
      },
    });
    insertedFolioLines += 1;
    if (ancillaryCharge > 0) {
      await prisma.folioLine.create({
        data: {
          folioId: folio.id,
          lineType: FolioLineType.CHARGE,
          description: "Restaurant and guest services — sample charges",
          department: "RESTAURANT",
          ...tax(ancillaryCharge, "RESTAURANT"),
          createdAt: checkOut > today ? today : checkOut,
        },
      });
      insertedFolioLines += 1;
    }
    await prisma.folioLine.create({
      data: {
        folioId: folio.id,
        lineType: FolioLineType.PAYMENT,
        description: isFuture ? "Reservation deposit — sample payment" : isInHouse ? "Advance payment — sample payment" : "Folio settlement — sample payment",
        amount: new Prisma.Decimal(paidAmount),
        department: "OTHER",
        taxRate: new Prisma.Decimal(0),
        netAmount: new Prisma.Decimal(0),
        vatAmount: new Prisma.Decimal(0),
        levyAmount: new Prisma.Decimal(0),
        paymentMethod: dayOffset % 2 === 0 ? "CASH" : "CARD",
        createdAt: checkOut > today ? today : checkOut,
      },
    });
    insertedFolioLines += 1;
  }

  console.log(JSON.stringify({
    range: { from: start.toISOString().slice(0, 10), through: today.toISOString().slice(0, 10) },
    inserted: { reservations: insertedReservations, folios: insertedFolios, folioLines: insertedFolioLines },
    skippedExistingReservations: skipped,
    seedMarker,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
