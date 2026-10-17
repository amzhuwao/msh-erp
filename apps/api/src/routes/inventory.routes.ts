import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, getClientIp, validateBody, validateQuery } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import { approveHousekeepingSupplyIssue, listHousekeepingSupplyIssues } from "../services/housekeeping.service.js";
import {
  createItem,
  approveStockCountAdjustment,
  getBalances,
  getStockCountApprovalThreshold,
  listPendingStockCountAdjustments,
  listItems,
  listLocations,
  lowStockAlerts,
  reconcileCount,
  rejectStockCountAdjustment,
  setStockCountApprovalThreshold,
  transferStock,
} from "../services/inventory.service.js";

export const inventoryRouter = Router();
inventoryRouter.use(authenticate);

inventoryRouter.get("/items", authorize("Inventory", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listItems() });
}));

inventoryRouter.post("/items", authorize("Inventory", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    itemCode: z.string(),
    name: z.string(),
    category: z.string(),
    baseUnitOfMeasure: z.string(),
    reorderLevel: z.number().optional(),
    reorderQuantity: z.number().optional(),
    isPerishable: z.boolean().optional(),
    currentAverageCost: z.number().optional(),
  }), req);
  res.status(201).json(await createItem(body));
}));

inventoryRouter.get("/locations", authorize("Inventory", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listLocations() });
}));

inventoryRouter.get("/balances", authorize("Inventory", "VIEW"), asyncHandler(async (req, res) => {
  const q = validateQuery(z.object({ locationId: z.string().optional() }), req);
  res.json({ items: await getBalances(q.locationId) });
}));

inventoryRouter.get("/alerts/low-stock", authorize("Inventory", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await lowStockAlerts() });
}));

inventoryRouter.get("/count-adjustments/pending", authorize("Inventory", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listPendingStockCountAdjustments() });
}));

inventoryRouter.get("/count-adjustment-threshold", authorize("Inventory", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ threshold: await getStockCountApprovalThreshold() });
}));

inventoryRouter.put("/count-adjustment-threshold", authorize("Inventory", "APPROVE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ threshold: z.number().min(0) }), req);
  res.json(await setStockCountApprovalThreshold(body.threshold, req.user!.id));
}));

inventoryRouter.post("/count-adjustments/:id/approve", authorize("Inventory", "APPROVE"), asyncHandler(async (req, res) => {
  res.json(await approveStockCountAdjustment(paramId(req.params.id), req.user!.id));
}));

inventoryRouter.post("/count-adjustments/:id/reject", authorize("Inventory", "APPROVE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ reason: z.string().trim().min(3) }), req);
  res.json(await rejectStockCountAdjustment(paramId(req.params.id), body.reason, req.user!.id));
}));

inventoryRouter.get("/housekeeping-issues", authorize("Inventory", "VIEW"), asyncHandler(async (req, res) => {
  const q = validateQuery(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req);
  res.json({ items: await listHousekeepingSupplyIssues(q.date) });
}));

inventoryRouter.post("/housekeeping-issues/:id/approve", authorize("Inventory", "APPROVE"), asyncHandler(async (req, res) => {
  res.json(await approveHousekeepingSupplyIssue({ id: paramId(req.params.id), userId: req.user!.id, ipAddress: getClientIp(req) }));
}));

inventoryRouter.post("/transfers", authorize("Inventory", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    itemId: z.string(),
    fromLocationId: z.string(),
    toLocationId: z.string(),
    quantity: z.number().positive(),
    referenceDocument: z.string(),
  }), req);
  res.json(await transferStock({ ...body, userId: req.user!.id }));
}));

inventoryRouter.post("/reconcile-count", authorize("Inventory", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    itemId: z.string(),
    storeLocationId: z.string(),
    countedQuantity: z.number().min(0),
    referenceDocument: z.string(),
    reason: z.string().trim().min(3),
  }), req);
  res.json(await reconcileCount({ ...body, userId: req.user!.id }));
}));
