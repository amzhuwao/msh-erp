import { AppError } from "./errors.js";

export const VAT_RATE = 0.15;
export const ZTA_LEVY_RATE = 0.02;

export type ChargeDepartment = "ROOMS" | "RESTAURANT" | "BAR" | "CONFERENCE" | "SERVICES" | "OTHER";

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function splitVatInclusive(gross: number, vatRate = VAT_RATE) {
  const net = roundMoney(gross / (1 + vatRate));
  const vat = roundMoney(gross - net);
  return { net, vat, gross: roundMoney(gross), vatRate };
}

export function taxFieldsForCharge(input: {
  amount: number;
  department?: ChargeDepartment | string | null;
  vatInclusive?: boolean;
}) {
  const department = input.department ?? "OTHER";
  const vatInclusive = input.vatInclusive ?? true;
  const vatRate = VAT_RATE;
  const net = vatInclusive
    ? roundMoney(input.amount / (1 + vatRate))
    : roundMoney(input.amount);
  const vat = vatInclusive
    ? roundMoney(input.amount - net)
    : roundMoney(input.amount * vatRate);
  const gross = vatInclusive ? roundMoney(input.amount) : roundMoney(net + vat);
  const levy = department === "ROOMS" ? roundMoney(net * ZTA_LEVY_RATE) : 0;
  return { department, taxRate: vatRate, netAmount: net, vatAmount: vat, levyAmount: levy, amount: gross };
}

export function parseDateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const endExclusive = new Date(`${endDate}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endExclusive.getTime())) {
    throw new AppError(400, "RPT-001", "Invalid report dates");
  }
  if (start >= endExclusive) {
    throw new AppError(400, "RPT-002", "Start date must be on or before end date");
  }
  return { start, end: endExclusive, startDate, endDate };
}

export function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function toUtcDateOnly(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function mealPeriodFromTime(date = new Date()): "BREAKFAST" | "LUNCH" | "DINNER" {
  const hour = date.getHours();
  if (hour < 11) return "BREAKFAST";
  if (hour < 16) return "LUNCH";
  return "DINNER";
}
