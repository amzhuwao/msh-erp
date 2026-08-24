import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, validateBody } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import {
  approvePurchaseOrder,
  approveRequisition,
  createPurchaseOrder,
  createRequisition,
  listPurchaseOrders,
  listRequisitions,
  listSuppliers,
  receiveGrn,
  validateInvoiceMatch,
} from "../services/procurement.service.js";

export const procurementRouter = Router();
procurementRouter.use(authenticate);

procurementRouter.get("/suppliers", authorize("Procurement", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listSuppliers() });
}));

procurementRouter.get("/requisitions", authorize("Procurement", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listRequisitions() });
}));

procurementRouter.post("/requisitions", authorize("Procurement", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    departmentId: z.string(),
    requiredDate: z.string(),
    notes: z.string().optional(),
    items: z.array(z.object({
      itemId: z.string().optional(),
      description: z.string(),
      quantityRequested: z.number().positive(),
      estimatedUnitPrice: z.number().min(0),
    })).min(1),
  }), req);
  res.status(201).json(await createRequisition({ ...body, userId: req.user!.id }));
}));

procurementRouter.put("/requisitions/:id/approve", authorize("Procurement", "APPROVE"), asyncHandler(async (req, res) => {
  res.json(await approveRequisition(paramId(req.params.id), req.user!.id));
}));

procurementRouter.get("/purchase-orders", authorize("Procurement", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listPurchaseOrders() });
}));

procurementRouter.post("/purchase-orders", authorize("Procurement", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    supplierId: z.string(),
    requisitionId: z.string().optional(),
    items: z.array(z.object({
      itemId: z.string().optional(),
      description: z.string(),
      quantity: z.number().positive(),
      unitPrice: z.number().min(0),
    })).min(1),
  }), req);
  res.status(201).json(await createPurchaseOrder({ ...body, userId: req.user!.id }));
}));

procurementRouter.put("/purchase-orders/:id/approve", authorize("Procurement", "APPROVE"), asyncHandler(async (req, res) => {
  res.json(await approvePurchaseOrder(paramId(req.params.id), req.user!.id));
}));

procurementRouter.post("/grn", authorize("Procurement", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    purchaseOrderId: z.string(),
    storeLocationId: z.string(),
    lines: z.array(z.object({ purchaseOrderItemId: z.string(), quantity: z.number().positive() })).min(1),
  }), req);
  res.status(201).json(await receiveGrn({ ...body, userId: req.user!.id }));
}));

procurementRouter.post("/supplier-invoices/validate-match", authorize("Procurement", "APPROVE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    purchaseOrderId: z.string(),
    invoiceNumber: z.string(),
    billedQuantity: z.number().positive(),
    billedUnitPrice: z.number().min(0),
    taxAmount: z.number().optional(),
  }), req);
  res.json(await validateInvoiceMatch(body));
}));
