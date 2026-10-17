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
  createAsset,
  listMaintenanceTechnicians,
  listPreventivePlans,
  createPreventivePlan,
  generateDuePreventiveWorkOrders,
  setAssetActive,
  listWorkOrders,
  listPendingTickets,
  startWorkOrder,
} from "../services/maintenance.service.js";

export const maintenanceRouter = Router();
maintenanceRouter.use(authenticate);

maintenanceRouter.get("/assets", authorize("Maintenance", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listAssets() });
}));

maintenanceRouter.post("/assets", authorize("Maintenance", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ assetCode: z.string().min(1), name: z.string().min(1), category: z.string().min(1), purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), purchaseCost: z.number().min(0), currentValue: z.number().min(0), depreciationRate: z.number().min(0).max(1).optional(), locationDescription: z.string().optional() }), req);
  res.status(201).json(await createAsset({ ...body, userId: req.user!.id }));
}));

maintenanceRouter.put("/assets/:id/status", authorize("Maintenance", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ isActive: z.boolean() }), req);
  res.json(await setAssetActive({ id: paramId(req.params.id), isActive: body.isActive, userId: req.user!.id }));
}));

maintenanceRouter.get("/technicians", authorize("Maintenance", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listMaintenanceTechnicians() });
}));

maintenanceRouter.get("/preventive-plans", authorize("Maintenance", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listPreventivePlans() });
}));

maintenanceRouter.post("/preventive-plans", authorize("Maintenance", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ planName: z.string().min(2), description: z.string().min(3), assetId: z.string(), intervalDays: z.number().int().min(1).max(3650), nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), assignedTechnicianId: z.string() }), req);
  res.status(201).json(await createPreventivePlan({ ...body, userId: req.user!.id }));
}));

maintenanceRouter.post("/preventive-plans/generate-due", authorize("Maintenance", "EDIT"), asyncHandler(async (req, res) => {
  res.json(await generateDuePreventiveWorkOrders({ userId: req.user!.id }));
}));

maintenanceRouter.get("/tickets/pending", authorize("Maintenance", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listPendingTickets() });
}));

maintenanceRouter.get("/work-orders/mine", authorize("Maintenance", "VIEW"), asyncHandler(async (req, res) => {
  res.json({ items: await listWorkOrders(req.user!.id) });
}));

maintenanceRouter.put("/work-orders/:id/start", authorize("Maintenance", "EDIT"), asyncHandler(async (req, res) => {
  res.json(await startWorkOrder(paramId(req.params.id), req.user!.id));
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
