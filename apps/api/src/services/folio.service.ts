import { FolioLineType, FolioStatus, ReservationStatus, RoomStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { nextDocumentNumber, writeAuditLog } from "./system.service.js";
import { getProperty, paymentInstructions } from "../lib/property.js";
import { taxFieldsForCharge, type ChargeDepartment } from "../lib/tax.js";

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
      reservation: {
        include: {
          room: { include: { roomType: true } },
          ratePlan: { include: { roomType: true } },
          guestServiceOrders: { include: { catalogItem: true } },
          posOrders: { include: { items: { include: { menuItem: true } }, outlet: true } },
        },
      },
    },
  });

  if (!folio) {
    throw new AppError(404, "FOL-001", "Folio not found");
  }

  const charges = folio.lines.filter((l) => l.lineType !== FolioLineType.PAYMENT);
  const net = charges.reduce((s, l) => s + Number(l.netAmount || 0), 0);
  const vat = charges.reduce((s, l) => s + Number(l.vatAmount || 0), 0);
  const levy = charges.reduce((s, l) => s + Number(l.levyAmount || 0), 0);

  return {
    ...folio,
    balance: calculateFolioBalance(folio.lines),
    taxSummary: {
      net: Math.round(net * 100) / 100,
      vat: Math.round(vat * 100) / 100,
      levy: Math.round(levy * 100) / 100,
      gross: Math.round((net + vat) * 100) / 100,
    },
  };
}

export async function postFolioCharge(input: {
  folioId: string;
  description: string;
  amount: number;
  department?: ChargeDepartment | string;
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

  const tax = taxFieldsForCharge({
    amount: input.amount,
    department: input.department ?? inferDepartment(input.description),
  });

  const line = await prisma.folioLine.create({
    data: {
      folioId: input.folioId,
      lineType: FolioLineType.CHARGE,
      description: input.description,
      amount: tax.amount,
      department: tax.department,
      taxRate: tax.taxRate,
      netAmount: tax.netAmount,
      vatAmount: tax.vatAmount,
      levyAmount: tax.levyAmount,
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
  paymentMethod?: string;
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
      department: "OTHER",
      taxRate: 0,
      netAmount: 0,
      vatAmount: 0,
      levyAmount: 0,
      paymentMethod: input.paymentMethod ?? inferPaymentMethod(input.description),
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
      const tax = taxFieldsForCharge({ amount: nightlyRate, department: "ROOMS" });
      await tx.folioLine.create({
        data: {
          folioId: folio.id,
          lineType: FolioLineType.CHARGE,
          description: `Room charge — ${today.toISOString().slice(0, 10)}`,
          amount: tax.amount,
          department: tax.department,
          taxRate: tax.taxRate,
          netAmount: tax.netAmount,
          vatAmount: tax.vatAmount,
          levyAmount: tax.levyAmount,
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

function inferDepartment(description: string): ChargeDepartment {
  const text = description.toLowerCase();
  if (text.includes("room charge") || text.includes("accommodation")) return "ROOMS";
  if (text.includes("lounge") || text.includes("bar") || text.includes("beverage")) return "BAR";
  if (text.includes("restaurant") || text.includes("breakfast") || text.includes("pos")) return "RESTAURANT";
  if (text.includes("conference") || text.includes("event") || text.includes("banquet")) return "CONFERENCE";
  if (text.includes("laundry") || text.includes("transit") || text.includes("concierge") || text.includes("room_service") || text.includes("service")) {
    return "SERVICES";
  }
  return "OTHER";
}

function inferPaymentMethod(description: string): string {
  const text = description.toLowerCase();
  if (text.includes("ecocash")) return "ECOCASH";
  if (text.includes("onemoney") || text.includes("netone")) return "ONEMONEY";
  if (text.includes("bank") || text.includes("transfer") || text.includes("rtgs")) return "BANK_TRANSFER";
  if (text.includes("card") || text.includes("visa") || text.includes("mastercard")) return "CARD";
  if (text.includes("room")) return "ROOM_CHARGE";
  return "CASH";
}

export async function buildFolioDocument(folioId: string, type: "invoice" | "receipt" | "quote") {
  const folio = await getFolioWithBalance(folioId);
  const property = await getProperty();
  const charges = folio.lines.filter((l) => l.lineType !== "PAYMENT");
  const payments = folio.lines.filter((l) => l.lineType === "PAYMENT");

  let documentNumber = type === "quote" ? `QT-${folio.id.slice(-6).toUpperCase()}` : folio.invoiceNumber;
  if (type === "invoice" && !folio.invoiceNumber) {
    documentNumber = await nextDocumentNumber("INVOICES");
    await prisma.folio.update({ where: { id: folioId }, data: { invoiceNumber: documentNumber } });
  }
  if (type === "receipt") {
    documentNumber = folio.receiptNumber;
    if (!documentNumber) {
      documentNumber = await nextDocumentNumber("RECEIPTS");
      await prisma.folio.update({ where: { id: folioId }, data: { receiptNumber: documentNumber } });
    }
  }

  const services = [
    ...folio.reservation.guestServiceOrders.map((o) => ({
      kind: "SERVICE" as const,
      reference: o.serviceNumber,
      description: o.catalogItem?.name ?? o.serviceType,
      amount: Number(o.totalCharge),
      status: o.status,
    })),
    ...folio.reservation.posOrders.map((o) => ({
      kind: "POS" as const,
      reference: o.orderNumber,
      description: `${o.outlet.name}: ${o.items.map((i) => `${i.quantity}× ${i.menuItem.name}`).join(", ")}`,
      amount: Number(o.totalAmount),
      status: o.status,
    })),
  ];

  return {
    type,
    documentTitle: type === "invoice" ? "TAX INVOICE" : type === "receipt" ? "RECEIPT" : "QUOTATION",
    documentNumber,
    issuedAt: new Date().toISOString(),
    property: {
      name: property.propertyName,
      address: property.address,
      vatNumber: property.vatNumber,
      bpNumber: property.bpNumber,
      phone: property.contactPhone,
      netoneNumber: property.netoneNumber,
      whatsappNumber: property.whatsappNumber,
      email: property.contactEmail,
    },
    guest: {
      name: `${folio.guest.firstName} ${folio.guest.lastName}`,
      email: folio.guest.email,
      phone: folio.guest.phone,
      nationality: folio.guest.nationality,
      nationalId: folio.guest.nationalId,
      passportNumber: folio.guest.passportNumber,
    },
    stay: {
      room: folio.reservation.room?.number ?? null,
      roomType: folio.reservation.room?.roomType?.name ?? folio.reservation.ratePlan.roomType.name,
    },
    reservation: folio.reservation,
    lines: charges.map((l) => ({
      description: l.description,
      department: l.department,
      net: Number(l.netAmount),
      vat: Number(l.vatAmount),
      levy: Number(l.levyAmount),
      gross: Number(l.amount),
      date: l.createdAt,
    })),
    payments: payments.map((l) => ({
      description: l.description,
      method: l.paymentMethod,
      amount: Number(l.amount),
      date: l.createdAt,
    })),
    taxSummary: folio.taxSummary,
    balance: folio.balance,
    services,
    paymentInstructions: paymentInstructions(property),
  };
}

