import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, validateBody } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import {
  addWorkOrderPart,
  completeWorkOrder,
  createTicket,
  dispatchWorkOrder,
  listAssets,
  listPendingTickets,
} from "../services/maintenance.service.js";

export const maintenanceRouter = Router();
maintenanceRouter.use(authenticate);

maintenanceRouter.get("/assets", authorize("Maintenance", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listAssets() });
}));

maintenanceRouter.get("/tickets/pending", authorize("Maintenance", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listPendingTickets() });
}));

maintenanceRouter.post("/tickets", authorize("Maintenance", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    description: z.string().min(3),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "EMERGENCY"]).optional(),
    roomId: z.string().optional(),
    assetId: z.string().optional(),
  }), req);
  res.status(201).json(await createTicket({ ...body, userId: req.user!.id }));
}));

maintenanceRouter.post("/work-orders", authorize("Maintenance", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    ticketId: z.string(),
    technicianUserId: z.string(),
    scheduledDate: z.string(),
  }), req);
  res.status(201).json(await dispatchWorkOrder({ ...body, userId: req.user!.id }));
}));

maintenanceRouter.post("/work-orders/:id/parts", authorize("Maintenance", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    itemId: z.string(),
    quantityUsed: z.number().positive(),
    storeLocationId: z.string(),
  }), req);
  res.status(201).json(await addWorkOrderPart({
    workOrderId: paramId(req.params.id),
    ...body,
    userId: req.user!.id,
  }));
}));

maintenanceRouter.put("/work-orders/:id/complete", authorize("Maintenance", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    labourHours: z.number().optional(),
    notes: z.string().optional(),
  }), req);
  res.json(await completeWorkOrder({
    workOrderId: paramId(req.params.id),
    ...body,
    userId: req.user!.id,
  }));
}));
