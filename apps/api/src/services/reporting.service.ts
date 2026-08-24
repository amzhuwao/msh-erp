import { FolioLineType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { writeAuditLog } from "./system.service.js";
import { getTrialBalance, getProfitAndLoss } from "./finance.service.js";
import { revenueMetrics } from "./revenue.service.js";
import { getBalances } from "./inventory.service.js";
import { parseDateRange, VAT_RATE, ZTA_LEVY_RATE, mealPeriodFromTime } from "../lib/tax.js";
import { getProperty } from "../lib/property.js";

export async function operationalArrivals(date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return prisma.reservation.findMany({
    where: { checkInDate: { gte: start, lt: end }, status: { in: ["CONFIRMED", "TENTATIVE", "CHECKED_IN"] } },
    include: { guest: true, room: true, ratePlan: true },
  });
}

export async function inventoryValuation(locationId?: string) {
  const balances = await getBalances(locationId);
  const rows = balances.map((b) => {
    const qty = Number(b.quantityOnHand);
    const cost = Number(b.item.currentAverageCost);
    return {
      itemCode: b.item.itemCode,
      name: b.item.name,
      location: b.storeLocation.locationName,
      quantity: qty,
      unitCost: cost,
      value: Math.round(qty * cost * 100) / 100,
    };
  });
  return {
    locationId,
    totalValue: rows.reduce((s, r) => s + r.value, 0),
    rows,
  };
}

function money(n: number) {
  return Math.round(n * 100) / 100;
}

export async function salesReport(startDate: string, endDate: string) {
  const { start, end } = parseDateRange(startDate, endDate);
  const lines = await prisma.folioLine.findMany({
    where: { createdAt: { gte: start, lt: end }, lineType: { not: FolioLineType.PAYMENT } },
    include: { folio: { include: { guest: true, reservation: { include: { room: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const posOrders = await prisma.posOrder.findMany({
    where: { createdAt: { gte: start, lt: end }, status: "PAID" },
    include: { outlet: true, items: { include: { menuItem: true } } },
  });

  const departments: Record<string, { net: number; vat: number; levy: number; gross: number; count: number }> = {};
  const bump = (dept: string, net: number, vat: number, levy: number, gross: number) => {
    const cur = departments[dept] ?? { net: 0, vat: 0, levy: 0, gross: 0, count: 0 };
    cur.net += net;
    cur.vat += vat;
    cur.levy += levy;
    cur.gross += gross;
    cur.count += 1;
    departments[dept] = cur;
  };

  for (const line of lines) {
    bump(
      line.department ?? "OTHER",
      Number(line.netAmount),
      Number(line.vatAmount),
      Number(line.levyAmount),
      Number(line.amount),
    );
  }

  const invoices = lines.reduce<Record<string, {
    folioId: string;
    guest: string;
    room: string | null;
    services: { description: string; department: string | null; net: number; vat: number; gross: number }[];
    net: number;
    vat: number;
    gross: number;
  }>>((acc, line) => {
    const key = line.folioId;
    if (!acc[key]) {
      acc[key] = {
        folioId: line.folioId,
        guest: `${line.folio.guest.firstName} ${line.folio.guest.lastName}`,
        room: line.folio.reservation.room?.number ?? null,
        services: [],
        net: 0,
        vat: 0,
        gross: 0,
      };
    }
    acc[key].services.push({
      description: line.description,
      department: line.department,
      net: Number(line.netAmount),
      vat: Number(line.vatAmount),
      gross: Number(line.amount),
    });
    acc[key].net += Number(line.netAmount);
    acc[key].vat += Number(line.vatAmount);
    acc[key].gross += Number(line.amount);
    return acc;
  }, {});

  return {
    startDate,
    endDate,
    departments: Object.entries(departments).map(([department, v]) => ({
      department,
      net: money(v.net),
      vat: money(v.vat),
      levy: money(v.levy),
      zta: money(v.levy),
      gross: money(v.gross),
      lineCount: v.count,
    })),
    posOutlets: posOrders.reduce<Record<string, number>>((acc, o) => {
      acc[o.outlet.name] = money((acc[o.outlet.name] ?? 0) + Number(o.totalAmount));
      return acc;
    }, {}),
    invoices: Object.values(invoices).map((inv) => ({
      ...inv,
      net: money(inv.net),
      vat: money(inv.vat),
      gross: money(inv.gross),
    })),
    totals: Object.values(departments).reduce(
      (s, v) => ({
        net: money(s.net + v.net),
        vat: money(s.vat + v.vat),
        zta: money(s.zta + v.levy),
        gross: money(s.gross + v.gross),
      }),
      { net: 0, vat: 0, zta: 0, gross: 0 },
    ),
  };
}

export async function ztaReport(startDate: string, endDate: string) {
  const { start, end } = parseDateRange(startDate, endDate);
  const lines = await prisma.folioLine.findMany({
    where: {
      createdAt: { gte: start, lt: end },
      lineType: { not: FolioLineType.PAYMENT },
      OR: [{ department: "ROOMS" }, { description: { contains: "Room charge", mode: "insensitive" } }],
    },
    include: { folio: { include: { guest: true, reservation: { include: { room: true } } } } },
    orderBy: { createdAt: "asc" },
  });

  const rooms = lines.map((l) => ({
    date: l.createdAt.toISOString().slice(0, 10),
    guest: `${l.folio.guest.firstName} ${l.folio.guest.lastName}`,
    room: l.folio.reservation.room?.number ?? "—",
    exclusiveAccommodation: Number(l.netAmount),
    levy: Number(l.levyAmount) || money(Number(l.netAmount) * ZTA_LEVY_RATE),
    description: l.description,
  }));

  const exclusive = rooms.reduce((s, r) => s + r.exclusiveAccommodation, 0);
  const levyDue = rooms.reduce((s, r) => s + r.levy, 0);

  return {
    startDate,
    endDate,
    authority: "Zimbabwe Tourism Authority",
    levyRatePercent: ZTA_LEVY_RATE * 100,
    roomNights: rooms.length,
    exclusiveAccommodation: money(exclusive),
    levyDue: money(levyDue),
    rooms,
  };
}

export async function foodCoversReport(startDate: string, endDate: string) {
  const { start, end } = parseDateRange(startDate, endDate);
  const orders = await prisma.posOrder.findMany({
    where: { createdAt: { gte: start, lt: end }, status: { in: ["PAID", "BILL_PRINTED", "OPEN"] } },
    include: { items: { include: { menuItem: true } }, outlet: true },
  });
  const conferences = await prisma.conferenceBooking.findMany({
    where: { startTimestamp: { gte: start, lt: end }, status: { not: "CANCELLED" } },
    include: { venue: true, package: true },
  });

  const buckets: Record<"BREAKFAST" | "LUNCH" | "DINNER" | "CONFERENCE", { covers: number; revenue: number; items: string[] }> = {
    BREAKFAST: { covers: 0, revenue: 0, items: [] },
    LUNCH: { covers: 0, revenue: 0, items: [] },
    DINNER: { covers: 0, revenue: 0, items: [] },
    CONFERENCE: { covers: 0, revenue: 0, items: [] },
  };

  for (const order of orders) {
    for (const item of order.items) {
      const declared = item.menuItem.mealPeriod;
      const cat = item.menuItem.category.toLowerCase();
      let key: "BREAKFAST" | "LUNCH" | "DINNER" | "CONFERENCE" = mealPeriodFromTime(order.createdAt);
      if (declared === "BREAKFAST" || declared === "LUNCH" || declared === "DINNER" || declared === "CONFERENCE") {
        key = declared;
      } else if (cat.includes("breakfast")) key = "BREAKFAST";
      else if (cat.includes("lunch")) key = "LUNCH";
      else if (cat.includes("dinner") || cat.includes("main")) key = "DINNER";
      const bucket = buckets[key];
      bucket.covers += item.quantity;
      bucket.revenue += Number(item.subtotal);
      bucket.items.push(`${item.quantity}× ${item.menuItem.name} (${order.outlet.name})`);
    }
  }

  for (const booking of conferences) {
    buckets.CONFERENCE.covers += booking.estimatedPax;
    buckets.CONFERENCE.revenue += Number(booking.totalAmount);
    buckets.CONFERENCE.items.push(`${booking.bookingNumber} · ${booking.venue.name} · ${booking.estimatedPax} pax`);
  }

  return {
    startDate,
    endDate,
    periods: Object.entries(buckets).map(([period, v]) => ({
      period,
      covers: v.covers,
      revenue: money(v.revenue),
      sampleItems: v.items.slice(0, 12),
    })),
    totalCovers: Object.values(buckets).reduce((s, v) => s + v.covers, 0),
    totalRevenue: money(Object.values(buckets).reduce((s, v) => s + v.revenue, 0)),
  };
}

export async function vatReport(startDate: string, endDate: string) {
  const { start, end } = parseDateRange(startDate, endDate);
  const property = await getProperty();
  const outputLines = await prisma.folioLine.findMany({
    where: { createdAt: { gte: start, lt: end }, lineType: { not: FolioLineType.PAYMENT } },
    include: { folio: { include: { guest: true } } },
  });
  const posPaid = await prisma.posOrder.findMany({
    where: { createdAt: { gte: start, lt: end }, status: "PAID", reservationId: null },
  });
  const supplierInvoices = await prisma.supplierInvoice.findMany({
    where: { createdAt: { gte: start, lt: end } },
  });

  const standardRatedExcl = outputLines.reduce((s, l) => s + Number(l.netAmount), 0)
    + posPaid.reduce((s, o) => s + Number(o.subTotal), 0);
  const outputVat = outputLines.reduce((s, l) => s + Number(l.vatAmount), 0)
    + posPaid.reduce((s, o) => s + Number(o.taxAmount), 0);
  const inputVat = supplierInvoices.reduce((s, i) => s + Number(i.taxAmount), 0);
  const zeroRated = 0;
  const exempt = 0;

  const taxInvoices = outputLines.reduce<Record<string, {
    invoiceNumber: string | null;
    date: string;
    customer: string;
    net: number;
    vat: number;
    total: number;
    lines: { description: string; net: number; vat: number; total: number }[];
  }>>((acc, line) => {
    const key = line.folioId;
    if (!acc[key]) {
      acc[key] = {
        invoiceNumber: line.folio.invoiceNumber,
        date: line.createdAt.toISOString().slice(0, 10),
        customer: `${line.folio.guest.firstName} ${line.folio.guest.lastName}`,
        net: 0,
        vat: 0,
        total: 0,
        lines: [],
      };
    }
    acc[key].net += Number(line.netAmount);
    acc[key].vat += Number(line.vatAmount);
    acc[key].total += Number(line.amount);
    acc[key].lines.push({
      description: line.description,
      net: Number(line.netAmount),
      vat: Number(line.vatAmount),
      total: Number(line.amount),
    });
    return acc;
  }, {});

  return {
    startDate,
    endDate,
    form: "ZIMRA VAT return (VAT 7 style)",
    ratePercent: VAT_RATE * 100,
    supplier: {
      name: property.propertyName,
      address: property.address,
      vatNumber: property.vatNumber,
      bpNumber: property.bpNumber,
      phone: property.contactPhone,
      netoneNumber: property.netoneNumber,
    },
    boxes: {
      box1StandardRatedSuppliesExclVat: money(standardRatedExcl),
      box2ZeroRatedSupplies: money(zeroRated),
      box3ExemptSupplies: money(exempt),
      outputVat: money(outputVat),
      inputVat: money(inputVat),
      vatPayable: money(outputVat - inputVat),
    },
    taxInvoices: Object.values(taxInvoices).map((inv) => ({
      ...inv,
      net: money(inv.net),
      vat: money(inv.vat),
      total: money(inv.total),
    })),
  };
}

export async function reservationServicesReport(startDate: string, endDate: string) {
  const { start, end } = parseDateRange(startDate, endDate);
  const reservations = await prisma.reservation.findMany({
    where: {
      OR: [
        { checkInDate: { gte: start, lt: end } },
        { createdAt: { gte: start, lt: end } },
      ],
    },
    include: {
      guest: true,
      room: true,
      ratePlan: { include: { roomType: true } },
      folios: { include: { lines: true } },
      guestServiceOrders: { include: { catalogItem: true } },
      posOrders: { include: { items: { include: { menuItem: true } }, outlet: true } },
    },
    orderBy: { checkInDate: "asc" },
  });

  return {
    startDate,
    endDate,
    items: reservations.map((r) => ({
      reservationNumber: r.reservationNumber,
      guest: `${r.guest.firstName} ${r.guest.lastName}`,
      nationality: r.guest.nationality,
      room: r.room?.number ?? null,
      roomType: r.ratePlan.roomType.name,
      status: r.status,
      source: r.source,
      checkInDate: r.checkInDate,
      checkOutDate: r.checkOutDate,
      services: [
        ...r.folios.flatMap((f) => f.lines.filter((l) => l.lineType !== "PAYMENT").map((l) => ({
          type: "FOLIO",
          description: l.description,
          amount: Number(l.amount),
          vat: Number(l.vatAmount),
        }))),
        ...r.guestServiceOrders.map((o) => ({
          type: "SERVICE",
          description: o.catalogItem?.name ?? o.serviceType,
          amount: Number(o.totalCharge),
          vat: money(Number(o.totalCharge) - Number(o.totalCharge) / (1 + VAT_RATE)),
        })),
        ...r.posOrders.map((o) => ({
          type: "POS",
          description: `${o.outlet.name}: ${o.items.map((i) => `${i.quantity}× ${i.menuItem.name}`).join(", ")}`,
          amount: Number(o.totalAmount),
          vat: Number(o.taxAmount),
        })),
      ],
    })),
  };
}

export async function customBuild(input: {
  dataset: "arrivals" | "inventory" | "trial-balance" | "revenue" | "sales" | "zta" | "food-covers" | "vat" | "reservations";
  date?: string;
  startDate?: string;
  endDate?: string;
  locationId?: string;
  userId: string;
}) {
  const startDate = input.startDate ?? input.date ?? new Date().toISOString().slice(0, 10);
  const endDate = input.endDate ?? input.date ?? new Date().toISOString().slice(0, 10);
  let result: unknown;
  if (input.dataset === "arrivals") {
    result = await operationalArrivals(startDate);
  } else if (input.dataset === "inventory") {
    result = await inventoryValuation(input.locationId);
  } else if (input.dataset === "trial-balance") {
    result = await getTrialBalance();
  } else if (input.dataset === "sales") {
    result = await salesReport(startDate, endDate);
  } else if (input.dataset === "zta") {
    result = await ztaReport(startDate, endDate);
  } else if (input.dataset === "food-covers") {
    result = await foodCoversReport(startDate, endDate);
  } else if (input.dataset === "vat") {
    result = await vatReport(startDate, endDate);
  } else if (input.dataset === "reservations") {
    result = await reservationServicesReport(startDate, endDate);
  } else {
    result = await revenueMetrics(startDate, endDate);
  }
  await writeAuditLog({
    userId: input.userId,
    module: "Reporting",
    action: "REPORT_EXPORTED",
    details: { dataset: input.dataset, startDate, endDate },
  });
  return result;
}

export async function createSchedule(input: {
  reportName: string;
  cronHint: string;
  recipient: string;
  format?: string;
  userId: string;
}) {
  const schedule = await prisma.reportSchedule.create({
    data: {
      reportName: input.reportName,
      cronHint: input.cronHint,
      recipient: input.recipient,
      format: input.format ?? "CSV",
      createdById: input.userId,
    },
  });
  await writeAuditLog({
    userId: input.userId,
    module: "Reporting",
    action: "REPORT_SCHEDULE_CREATED",
    entityType: "ReportSchedule",
    entityId: schedule.id,
  });
  return schedule;
}

export async function dashboardSummary() {
  const today = new Date().toISOString().slice(0, 10);
  const [arrivals, trial, pnl, metrics, sales] = await Promise.all([
    operationalArrivals(today),
    getTrialBalance(),
    getProfitAndLoss(),
    revenueMetrics(today, today),
    salesReport(today, today),
  ]);
  return { arrivals: arrivals.length, trial, pnl, metrics, sales };
}
