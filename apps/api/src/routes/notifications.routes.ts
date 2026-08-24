import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, validateBody, validateQuery } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import {
  createTemplate,
  listQueue,
  listTemplates,
  retryNotification,
  sendDirect,
  updateConsent,
} from "../services/notification.service.js";

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get("/templates", authorize("Notifications", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listTemplates() });
}));

notificationsRouter.post("/templates", authorize("Notifications", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    name: z.string(),
    channel: z.enum(["EMAIL", "SMS", "IN_APP"]),
    subjectPattern: z.string().optional(),
    bodyPattern: z.string(),
  }), req);
  res.status(201).json(await createTemplate(body));
}));

notificationsRouter.get("/queue", authorize("Notifications", "VIEW"), asyncHandler(async (req, res) => {
  const q = validateQuery(z.object({ status: z.enum(["PENDING", "SENDING", "SENT", "FAILED", "RETRYING"]).optional() }), req);
  res.json({ items: await listQueue(q.status) });
}));

notificationsRouter.post("/send-direct", authorize("Notifications", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    templateName: z.string().optional(),
    recipientContact: z.string(),
    channel: z.enum(["EMAIL", "SMS", "IN_APP"]),
    variables: z.record(z.string(), z.string()).optional(),
    subject: z.string().optional(),
    body: z.string().optional(),
    guestId: z.string().optional(),
    transactional: z.boolean().optional(),
  }), req);
  res.status(201).json(await sendDirect(body));
}));

notificationsRouter.post("/:id/retry", authorize("Notifications", "EDIT"), asyncHandler(async (req, res) => {
  res.json(await retryNotification(paramId(req.params.id)));
}));

notificationsRouter.put("/consent", authorize("Notifications", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    guestId: z.string(),
    channel: z.enum(["EMAIL", "SMS"]),
    isOptIn: z.boolean(),
  }), req);
  res.json(await updateConsent(body.guestId, body.channel, body.isOptIn));
}));
