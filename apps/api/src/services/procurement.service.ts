import { PurchaseOrderStatus, RequisitionStatus, SupplierInvoiceStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { nextDocumentNumber, writeAuditLog } from "./system.service.js";
import { receiveStock } from "./inventory.service.js";

export async function listSuppliers() {
  return prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

export async function listRequisitions() {
  return prisma.purchaseRequisition.findMany({
    include: { department: true, items: true, requester: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function listPurchaseOrders() {
  return prisma.purchaseOrder.findMany({
    include: { supplier: true, items: { include: { item: true } }, grns: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function createRequisition(input: {
  departmentId: string;
  requiredDate: string;
  notes?: string;
  items: { itemId?: string; description: string; quantityRequested: number; estimatedUnitPrice: number }[];
  userId: string;
}) {
  if (input.items.length === 0) throw new AppError(400, "PRC-001", "At least one line is required");
  const requisitionNumber = await nextDocumentNumber("REQUISITIONS");
  return prisma.purchaseRequisition.create({
    data: {
      requisitionNumber,
      departmentId: input.departmentId,
      requesterUserId: input.userId,
      requiredDate: new Date(input.requiredDate),
      notes: input.notes,
      approvalStatus: RequisitionStatus.SUBMITTED,
      items: { create: input.items },
    },
    include: { items: true, department: true },
  });
}

export async function approveRequisition(id: string, userId: string) {
  const req = await prisma.purchaseRequisition.findUnique({ where: { id } });
  if (!req) throw new AppError(404, "PRC-002", "Requisition not found");
  if (req.requesterUserId === userId) {
    throw new AppError(400, "PRC-003", "Requester cannot approve their own requisition");
  }
  const updated = await prisma.purchaseRequisition.update({
    where: { id },
    data: { approvalStatus: RequisitionStatus.APPROVED, approvedById: userId },
    include: { items: true },
  });
  await writeAuditLog({
    userId,
    module: "Procurement",
    action: "REQUISITION_APPROVED",
    entityType: "PurchaseRequisition",
    entityId: id,
  });
  return updated;
}

export async function createPurchaseOrder(input: {
  supplierId: string;
  requisitionId?: string;
  items: { itemId?: string; description: string; quantity: number; unitPrice: number }[];
  userId: string;
}) {
  if (input.items.length === 0) throw new AppError(400, "PRC-001", "At least one line is required");
  const subtotal = input.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount = Math.round(subtotal * 0.15 * 100) / 100;
  const totalAmount = subtotal + taxAmount;
  const poNumber = await nextDocumentNumber("PO");

  let status: PurchaseOrderStatus = PurchaseOrderStatus.PENDING_APPROVAL;
  if (totalAmount <= 500) status = PurchaseOrderStatus.SENT_TO_SUPPLIER;

  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber,
      supplierId: input.supplierId,
      requisitionId: input.requisitionId,
      subtotal,
      taxAmount,
      totalAmount,
      status,
      createdById: input.userId,
      approvedById: totalAmount <= 500 ? input.userId : undefined,
      items: { create: input.items },
    },
    include: { supplier: true, items: true },
  });
  return po;
}

export async function approvePurchaseOrder(id: string, userId: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
  if (!po) throw new AppError(404, "PRC-004", "Purchase order not found");
  if (po.createdById === userId) {
    throw new AppError(400, "PRC-003", "Creator cannot be the final PO approver");
  }
  const total = Number(po.totalAmount);
  if (total > 5000) {
    // GM-level; still allow admin/approve permission at route layer
  }
  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: PurchaseOrderStatus.SENT_TO_SUPPLIER, approvedById: userId },
    include: { supplier: true, items: true },
  });
  await writeAuditLog({
    userId,
    module: "Procurement",
    action: "PO_APPROVED",
    entityType: "PurchaseOrder",
    entityId: id,
    details: { poNumber: po.poNumber, total },
  });
  return updated;
}

export async function receiveGrn(input: {
  purchaseOrderId: string;
  storeLocationId: string;
  lines: { purchaseOrderItemId: string; quantity: number }[];
  userId: string;
}) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: input.purchaseOrderId },
    include: { items: true, supplier: true },
  });
  if (!po) throw new AppError(404, "PRC-004", "Purchase order not found");

  for (const line of input.lines) {
    const poi = po.items.find((i) => i.id === line.purchaseOrderItemId);
    if (!poi) throw new AppError(400, "PRC-005", "PO line not found");
    const remaining = Number(poi.quantity) - Number(poi.receivedQty);
    if (line.quantity > remaining) {
      throw new AppError(400, "PRC-006", "Received quantity exceeds remaining ordered quantity");
    }
  }

  const grnNumber = await nextDocumentNumber("GRN");
  const grn = await prisma.goodsReceivedNote.create({
    data: {
      grnNumber,
      purchaseOrderId: po.id,
      supplierId: po.supplierId,
      receivedDate: new Date(),
      receivedByUserId: input.userId,
    },
  });

  let fullyReceived = true;
  for (const line of input.lines) {
    const poi = po.items.find((i) => i.id === line.purchaseOrderItemId)!;
    const newReceived = Number(poi.receivedQty) + line.quantity;
    await prisma.purchaseOrderItem.update({
      where: { id: poi.id },
      data: { receivedQty: newReceived },
    });
    if (newReceived < Number(poi.quantity)) fullyReceived = false;
    if (poi.itemId) {
      await receiveStock({
        itemId: poi.itemId,
        storeLocationId: input.storeLocationId,
        quantity: line.quantity,
        unitCost: Number(poi.unitPrice),
        referenceDocument: grnNumber,
        userId: input.userId,
      });
    }
  }

  for (const poi of po.items) {
    const extra = input.lines.find((l) => l.purchaseOrderItemId === poi.id);
    const received = Number(poi.receivedQty) + (extra?.quantity ?? 0);
    if (received < Number(poi.quantity)) fullyReceived = false;
  }

  await prisma.goodsReceivedNote.update({
    where: { id: grn.id },
    data: { isFullyReceived: fullyReceived },
  });
  await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: {
      status: fullyReceived ? PurchaseOrderStatus.COMPLETED : PurchaseOrderStatus.PARTIALLY_RECEIVED,
    },
  });
  return prisma.goodsReceivedNote.findUnique({ where: { id: grn.id }, include: { purchaseOrder: true } });
}

export async function validateInvoiceMatch(input: {
  purchaseOrderId: string;
  invoiceNumber: string;
  billedQuantity: number;
  billedUnitPrice: number;
  taxAmount?: number;
}) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: input.purchaseOrderId },
    include: { items: true, grns: true, supplier: true },
  });
  if (!po) throw new AppError(404, "PRC-004", "Purchase order not found");

  const orderedQty = po.items.reduce((s, i) => s + Number(i.quantity), 0);
  const receivedQty = po.items.reduce((s, i) => s + Number(i.receivedQty), 0);
  const orderedPrice = orderedQty === 0 ? 0 : Number(po.subtotal) / orderedQty;

  const qtyOk = input.billedQuantity <= receivedQty + 0.001;
  const priceOk = Math.abs(input.billedUnitPrice - orderedPrice) / Math.max(orderedPrice, 0.01) <= 0.02;
  const matched = qtyOk && priceOk;

  const netAmount = input.billedQuantity * input.billedUnitPrice;
  const taxAmount = input.taxAmount ?? Math.round(netAmount * 0.15 * 100) / 100;
  const invoice = await prisma.supplierInvoice.create({
    data: {
      invoiceNumber: input.invoiceNumber,
      purchaseOrderId: po.id,
      supplierId: po.supplierId,
      netAmount,
      taxAmount,
      totalAmount: netAmount + taxAmount,
      status: matched ? SupplierInvoiceStatus.APPROVED_FOR_PAYMENT : SupplierInvoiceStatus.VARIANCE_HOLD,
    },
  });

  if (!matched) {
    await writeAuditLog({
      module: "Procurement",
      action: "INVOICE_MATCH_FAILED",
      entityType: "SupplierInvoice",
      entityId: invoice.id,
      details: { billedQuantity: input.billedQuantity, receivedQty, billedUnitPrice: input.billedUnitPrice },
    });
  }
  return { matched, invoice, checks: { qtyOk, priceOk, receivedQty, orderedQty } };
}
