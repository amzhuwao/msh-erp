import { prisma } from "../lib/prisma.js";
import { writeAuditLog } from "./system.service.js";
import { getTrialBalance, getProfitAndLoss } from "./finance.service.js";
import { revenueMetrics } from "./revenue.service.js";
import { getBalances } from "./inventory.service.js";

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

export async function customBuild(input: {
  dataset: "arrivals" | "inventory" | "trial-balance" | "revenue";
  date?: string;
  startDate?: string;
  endDate?: string;
  locationId?: string;
  userId: string;
}) {
  let result: unknown;
  if (input.dataset === "arrivals") {
    result = await operationalArrivals(input.date ?? new Date().toISOString().slice(0, 10));
  } else if (input.dataset === "inventory") {
    result = await inventoryValuation(input.locationId);
  } else if (input.dataset === "trial-balance") {
    result = await getTrialBalance();
  } else {
    result = await revenueMetrics(
      input.startDate ?? new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      input.endDate ?? new Date().toISOString().slice(0, 10),
    );
  }
  await writeAuditLog({
    userId: input.userId,
    module: "Reporting",
    action: "REPORT_EXPORTED",
    details: { dataset: input.dataset },
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
  const [arrivals, trial, pnl, metrics] = await Promise.all([
    operationalArrivals(today),
    getTrialBalance(),
    getProfitAndLoss(),
    revenueMetrics(today, today),
  ]);
  return { arrivals: arrivals.length, trial, pnl, metrics };
}
