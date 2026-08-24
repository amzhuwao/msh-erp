import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, validateBody, validateQuery } from "../middleware/http.js";
import {
  createSchedule,
  customBuild,
  dashboardSummary,
  inventoryValuation,
  operationalArrivals,
} from "../services/reporting.service.js";
import { getTrialBalance } from "../services/finance.service.js";

export const reportsRouter = Router();
reportsRouter.use(authenticate);

reportsRouter.get("/dashboard", authorize("Reporting", "VIEW"), asyncHandler(async (_req, res) => {
  res.json(await dashboardSummary());
}));

reportsRouter.get("/operational/arrivals", authorize("Reporting", "VIEW"), asyncHandler(async (req, res) => {
  const q = validateQuery(z.object({ date: z.string() }), req);
  res.json({ items: await operationalArrivals(q.date) });
}));

reportsRouter.get("/financial/trial-balance", authorize("Reporting", "VIEW"), asyncHandler(async (_req, res) => {
  res.json(await getTrialBalance());
}));

reportsRouter.get("/inventory/valuation", authorize("Reporting", "VIEW"), asyncHandler(async (req, res) => {
  const q = validateQuery(z.object({ locationId: z.string().optional() }), req);
  res.json(await inventoryValuation(q.locationId));
}));

reportsRouter.post("/schedules", authorize("Reporting", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    reportName: z.string(),
    cronHint: z.string(),
    recipient: z.string(),
    format: z.string().optional(),
  }), req);
  res.status(201).json(await createSchedule({ ...body, userId: req.user!.id }));
}));

reportsRouter.post("/custom/build", authorize("Reporting", "VIEW"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    dataset: z.enum(["arrivals", "inventory", "trial-balance", "revenue"]),
    date: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    locationId: z.string().optional(),
  }), req);
  res.json(await customBuild({ ...body, userId: req.user!.id }));
}));
