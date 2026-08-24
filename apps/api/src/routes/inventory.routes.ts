import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, validateBody, validateQuery } from "../middleware/http.js";
import {
  createItem,
  getBalances,
  listItems,
  listLocations,
  lowStockAlerts,
  reconcileCount,
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

inventoryRouter.post("/reconcile-count", authorize("Inventory", "APPROVE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    itemId: z.string(),
    storeLocationId: z.string(),
    countedQuantity: z.number().min(0),
    referenceDocument: z.string(),
  }), req);
  res.json(await reconcileCount({ ...body, userId: req.user!.id }));
}));
