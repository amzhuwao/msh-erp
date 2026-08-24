import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, validateBody, validateQuery } from "../middleware/http.js";
import {
  calculateRate,
  createPromoCode,
  createYieldRule,
  listPromos,
  listYieldRules,
  revenueMetrics,
  validatePromo,
} from "../services/revenue.service.js";

export const revenueRouter = Router();
revenueRouter.use(authenticate);

revenueRouter.get("/calculate-rate", authorize("Revenue", "VIEW"), asyncHandler(async (req, res) => {
  const q = validateQuery(z.object({
    roomTypeId: z.string(),
    date: z.string(),
    promoCode: z.string().optional(),
    nights: z.coerce.number().optional(),
  }), req);
  res.json(await calculateRate(q.roomTypeId, q.date, q.promoCode, q.nights));
}));

revenueRouter.get("/metrics", authorize("Revenue", "VIEW"), asyncHandler(async (req, res) => {
  const q = validateQuery(z.object({ startDate: z.string(), endDate: z.string() }), req);
  res.json(await revenueMetrics(q.startDate, q.endDate));
}));

revenueRouter.get("/yield-rules", authorize("Revenue", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listYieldRules() });
}));

revenueRouter.post("/yield-rules", authorize("Revenue", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    roomTypeId: z.string(),
    occupancyThresholdPercent: z.number(),
    rateIncreasePercent: z.number(),
  }), req);
  res.status(201).json(await createYieldRule({ ...body, userId: req.user!.id }));
}));

revenueRouter.get("/promo-codes", authorize("Revenue", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listPromos() });
}));

revenueRouter.post("/promo-codes", authorize("Revenue", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    code: z.string(),
    discountType: z.enum(["PERCENT", "FIXED"]),
    discountValue: z.number(),
    startDate: z.string(),
    endDate: z.string(),
    minNights: z.number().optional(),
    usageLimit: z.number().optional(),
  }), req);
  res.status(201).json(await createPromoCode(body));
}));

revenueRouter.post("/promo-codes/validate", authorize("Revenue", "VIEW"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ code: z.string(), nights: z.number().optional() }), req);
  res.json(await validatePromo(body.code, body.nights));
}));
