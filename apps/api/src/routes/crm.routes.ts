import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, validateBody } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import {
  addActivity,
  createFeedback,
  createLead,
  listFeedback,
  listLeads,
  redeemLoyalty,
  updateLeadStage,
} from "../services/crm.service.js";

export const crmRouter = Router();
crmRouter.use(authenticate);

crmRouter.get("/leads", authorize("CRM", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listLeads() });
}));

crmRouter.post("/leads", authorize("CRM", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    companyName: z.string().optional(),
    contactPerson: z.string(),
    email: z.string().email(),
    phone: z.string().optional(),
    source: z.enum(["WEBSITE", "WALK_IN", "COLD_CALL", "AGENCY", "EVENT"]).optional(),
    estimatedValue: z.number().optional(),
  }), req);
  res.status(201).json(await createLead({ ...body, userId: req.user!.id }));
}));

crmRouter.put("/leads/:id/stage", authorize("CRM", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    stage: z.enum(["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]),
  }), req);
  res.json(await updateLeadStage(paramId(req.params.id), body.stage, req.user!.id));
}));

crmRouter.post("/leads/:id/activities", authorize("CRM", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    activityType: z.enum(["PHONE_CALL", "EMAIL", "MEETING", "PRESENTATION"]),
    summary: z.string(),
    activityDate: z.string(),
    followUpRequired: z.boolean().optional(),
    followUpDate: z.string().optional(),
  }), req);
  res.status(201).json(await addActivity({ leadId: paramId(req.params.id), ...body }));
}));

crmRouter.get("/feedback", authorize("CRM", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listFeedback() });
}));

crmRouter.post("/feedback", authorize("CRM", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    guestId: z.string(),
    reservationId: z.string().optional(),
    score: z.number().int().min(1).max(10),
    comments: z.string().optional(),
  }), req);
  res.status(201).json(await createFeedback(body));
}));

crmRouter.post("/loyalty/redemptions", authorize("CRM", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ guestId: z.string(), points: z.number().int().positive() }), req);
  res.json(await redeemLoyalty({ ...body, userId: req.user!.id }));
}));
