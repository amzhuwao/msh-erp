import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { writeAuditLog } from "./system.service.js";

export async function calculateRate(roomTypeId: string, date: string, promoCode?: string, nights = 1) {
  const roomType = await prisma.roomType.findUnique({
    where: { id: roomTypeId },
    include: {
      ratePlans: { where: { isActive: true }, take: 1 },
      yieldRules: { where: { isActive: true } },
      seasonalRates: { where: { isActive: true } },
      rooms: { where: { isActive: true } },
    },
  });
  if (!roomType) throw new AppError(404, "REV-001", "Room type not found");

  const target = new Date(date);
  const seasonal = roomType.seasonalRates.find(
    (s) => target >= s.startDate && target <= s.endDate,
  );
  let rate = seasonal ? Number(seasonal.adjustedRate) : Number(roomType.ratePlans[0]?.baseRate ?? roomType.baseRate);

  const occupied = await prisma.reservation.count({
    where: {
      room: { roomTypeId },
      status: { in: ["CONFIRMED", "CHECKED_IN"] },
      checkInDate: { lte: target },
      checkOutDate: { gt: target },
    },
  });
  const occupancy = roomType.rooms.length === 0 ? 0 : occupied / roomType.rooms.length;
  const yieldRule = roomType.yieldRules
    .filter((r) => occupancy >= Number(r.occupancyThresholdPercent))
    .sort((a, b) => Number(b.occupancyThresholdPercent) - Number(a.occupancyThresholdPercent))[0];
  if (yieldRule) {
    rate *= 1 + Number(yieldRule.rateIncreasePercent);
  }

  let promoDiscount = 0;
  if (promoCode) {
    const promo = await validatePromo(promoCode, nights);
    promoDiscount =
      promo.discountType === "PERCENT" ? rate * (Number(promo.discountValue) / 100) : Number(promo.discountValue);
    rate = Math.max(0, rate - promoDiscount);
  }

  return {
    roomTypeId,
    date,
    occupancyPercent: Math.round(occupancy * 10000) / 100,
    seasonalApplied: Boolean(seasonal),
    yieldApplied: yieldRule ? Number(yieldRule.rateIncreasePercent) : 0,
    promoDiscount,
    rate: Math.round(rate * 100) / 100,
  };
}

export async function validatePromo(code: string, nights = 1) {
  const promo = await prisma.promoCode.findUnique({ where: { code: code.toUpperCase() } });
  if (!promo?.isActive) throw new AppError(404, "REV-002", "Promo code not found");
  const now = new Date();
  if (now < promo.startDate || now > promo.endDate) throw new AppError(400, "REV-003", "Promo code is not in date range");
  if (promo.currentUsage >= promo.usageLimit) throw new AppError(400, "REV-004", "Promo code usage limit exceeded");
  if (nights < promo.minNights) throw new AppError(400, "REV-005", `Minimum stay is ${promo.minNights} nights`);
  return promo;
}

export async function createYieldRule(input: {
  roomTypeId: string;
  occupancyThresholdPercent: number;
  rateIncreasePercent: number;
  userId: string;
}) {
  const rule = await prisma.yieldRule.create({
    data: {
      roomTypeId: input.roomTypeId,
      occupancyThresholdPercent: input.occupancyThresholdPercent,
      rateIncreasePercent: input.rateIncreasePercent,
    },
  });
  await writeAuditLog({
    userId: input.userId,
    module: "Revenue",
    action: "DYNAMIC_RULE_ACTIVATED",
    entityType: "YieldRule",
    entityId: rule.id,
  });
  return rule;
}

export async function createPromoCode(input: {
  code: string;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  startDate: string;
  endDate: string;
  minNights?: number;
  usageLimit?: number;
}) {
  return prisma.promoCode.create({
    data: {
      code: input.code.toUpperCase(),
      discountType: input.discountType,
      discountValue: input.discountValue,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      minNights: input.minNights ?? 1,
      usageLimit: input.usageLimit ?? 100,
    },
  });
}

export async function revenueMetrics(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalRooms = await prisma.room.count({ where: { isActive: true } });
  const nights = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  const availableRoomNights = totalRooms * nights;

  const reservations = await prisma.reservation.findMany({
    where: {
      status: { in: ["CHECKED_IN", "CHECKED_OUT", "CONFIRMED"] },
      checkInDate: { lt: end },
      checkOutDate: { gt: start },
    },
    include: { ratePlan: true, folios: { include: { lines: true } } },
  });

  let occupiedRoomNights = 0;
  let roomRevenue = 0;
  for (const r of reservations) {
    const from = r.checkInDate > start ? r.checkInDate : start;
    const to = r.checkOutDate < end ? r.checkOutDate : end;
    const stay = Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
    occupiedRoomNights += stay;
    roomRevenue += stay * Number(r.ratePlan.baseRate);
  }

  const occupancy = availableRoomNights === 0 ? 0 : occupiedRoomNights / availableRoomNights;
  const adr = occupiedRoomNights === 0 ? 0 : roomRevenue / occupiedRoomNights;
  const revpar = availableRoomNights === 0 ? 0 : roomRevenue / availableRoomNights;

  return {
    startDate,
    endDate,
    totalRooms,
    occupiedRoomNights,
    availableRoomNights,
    occupancyPercent: Math.round(occupancy * 10000) / 100,
    adr: Math.round(adr * 100) / 100,
    revpar: Math.round(revpar * 100) / 100,
    roomRevenue: Math.round(roomRevenue * 100) / 100,
  };
}

export async function listYieldRules() {
  return prisma.yieldRule.findMany({ include: { roomType: true } });
}

export async function listPromos() {
  return prisma.promoCode.findMany({ orderBy: { code: "asc" } });
}
