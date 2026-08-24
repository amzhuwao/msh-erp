import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, getClientIp, validateBody, validateQuery } from "../middleware/http.js";
import {
  createApiKey,
  createWebhook,
  listApiKeys,
  listLogs,
  listWebhooks,
  otaSync,
  processPayment,
} from "../services/integration.service.js";

export const integrationsRouter = Router();
integrationsRouter.use(authenticate);

integrationsRouter.get("/keys", authorize("Integrations", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listApiKeys() });
}));

integrationsRouter.post("/keys", authorize("Integrations", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    clientName: z.string(),
    scopes: z.array(z.string()).default(["reservations:read"]),
    expiresAt: z.string().optional(),
  }), req);
  res.status(201).json(await createApiKey({ ...body, userId: req.user!.id }));
}));

integrationsRouter.get("/logs", authorize("Integrations", "VIEW"), asyncHandler(async (req, res) => {
  const q = validateQuery(z.object({ statusCode: z.coerce.number().optional() }), req);
  res.json({ items: await listLogs(q.statusCode) });
}));

integrationsRouter.get("/webhooks", authorize("Integrations", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listWebhooks() });
}));

integrationsRouter.post("/webhooks", authorize("Integrations", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ eventName: z.string(), targetUrl: z.string().url() }), req);
  res.status(201).json(await createWebhook({ ...body, userId: req.user!.id }));
}));

integrationsRouter.post("/ota/sync", authorize("Integrations", "EDIT"), asyncHandler(async (_req, res) => {
  res.json(await otaSync());
}));

integrationsRouter.post("/payments/process", authorize("Integrations", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    amount: z.number().positive(),
    currency: z.string().optional(),
    cardNumber: z.string().optional(),
    reference: z.string(),
  }), req);
  res.json(await processPayment(body));
  void getClientIp(req);
}));
