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
  listSupplierInvoices,
  listRequisitions,
  listSuppliers,
  receiveGrn,
  validateInvoiceMatch,
  listApprovalTiers,
  saveApprovalTiers,
  createSupplierQuote,
  selectSupplierQuote,
} from "../services/procurement.service.js";

export const procurementRouter = Router();
procurementRouter.use(authenticate);

procurementRouter.get("/suppliers", authorize("Procurement", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listSuppliers() });
}));

procurementRouter.get("/approval-tiers", authorize("Procurement", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listApprovalTiers() });
}));

procurementRouter.put("/approval-tiers", authorize("Procurement", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ tiers: z.array(z.object({ minimumTotal: z.number().min(0), requiredApprovals: z.number().int().min(1).max(5) })) }), req);
  res.json({ items: await saveApprovalTiers({ ...body, userId: req.user!.id }) });
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

procurementRouter.get("/supplier-invoices", authorize("Procurement", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listSupplierInvoices() });
}));

procurementRouter.post("/purchase-orders", authorize("Procurement", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    supplierId: z.string(),
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

procurementRouter.post("/purchase-orders/:id/supplier-quotes", authorize("Procurement", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ supplierId: z.string(), quoteNumber: z.string().min(1), lines: z.array(z.object({ purchaseOrderItemId: z.string(), quotedQuantity: z.number().positive(), quotedUnitPrice: z.number().min(0) })).min(1) }), req);
  res.status(201).json(await createSupplierQuote({ ...body, purchaseOrderId: paramId(req.params.id), userId: req.user!.id }));
}));

procurementRouter.put("/purchase-orders/:id/supplier-quotes/:quoteId/select", authorize("Procurement", "EDIT"), asyncHandler(async (req, res) => {
  res.json(await selectSupplierQuote({ purchaseOrderId: paramId(req.params.id), quoteId: paramId(req.params.quoteId), userId: req.user!.id }));
}));

procurementRouter.post("/grn", authorize("Procurement", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    purchaseOrderId: z.string(),
    storeLocationId: z.string(),
    invoiceReference: z.string().optional(),
    lines: z.array(z.object({ purchaseOrderItemId: z.string(), quantity: z.number().positive() })).min(1),
  }), req);
  res.status(201).json(await receiveGrn({ ...body, userId: req.user!.id }));
}));

procurementRouter.post("/supplier-invoices/validate-match", authorize("Procurement", "APPROVE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    purchaseOrderId: z.string(),
    invoiceNumber: z.string(),
    lines: z.array(z.object({ purchaseOrderItemId: z.string(), billedQuantity: z.number().positive(), billedUnitPrice: z.number().min(0) })).min(1),
    taxAmount: z.number().min(0).optional(),
  }), req);
  res.json(await validateInvoiceMatch({ ...body, userId: req.user!.id }));
}));
