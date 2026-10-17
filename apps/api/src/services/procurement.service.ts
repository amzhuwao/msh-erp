import { PurchaseOrderStatus, RequisitionStatus, SupplierInvoiceStatus, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { nextDocumentNumber, writeAuditLog } from "./system.service.js";
import { receiveStockInTransaction } from "./inventory.service.js";

export async function listSuppliers() {
  return prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

export async function listRequisitions() {
  return prisma.purchaseRequisition.findMany({
    include: { department: true, items: true, requester: { select: { fullName: true } }, purchaseOrder: { select: { id: true, poNumber: true, status: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function listPurchaseOrders() {
  return prisma.purchaseOrder.findMany({
    include: { supplier: true, items: { include: { item: true } }, grns: true, approvals: { include: { user: { select: { id: true, fullName: true } } } }, supplierQuotes: { include: { supplier: true, lines: true }, orderBy: { totalAmount: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function listApprovalTiers() {
  return prisma.procurementApprovalTier.findMany({ orderBy: { minimumTotal: "asc" } });
}

export async function saveApprovalTiers(input: { tiers: { minimumTotal: number; requiredApprovals: number }[]; userId: string }) {
  if (input.tiers.some((tier) => !Number.isFinite(tier.minimumTotal) || tier.minimumTotal < 0 || !Number.isInteger(tier.requiredApprovals) || tier.requiredApprovals < 1 || tier.requiredApprovals > 5)) throw new AppError(400, "PRC-018", "Approval tiers need a non-negative minimum and between one and five approvals");
  if (new Set(input.tiers.map((tier) => tier.minimumTotal)).size !== input.tiers.length) throw new AppError(400, "PRC-019", "Approval tier minimums must be unique");
  const tiers = [...input.tiers].sort((a, b) => a.minimumTotal - b.minimumTotal);
  await prisma.$transaction(async (tx) => {
    await tx.procurementApprovalTier.deleteMany();
    if (tiers.length) await tx.procurementApprovalTier.createMany({ data: tiers });
  });
  await writeAuditLog({ userId: input.userId, module: "Procurement", action: "APPROVAL_TIERS_UPDATED", entityType: "ProcurementApprovalTier", details: { tiers } });
  return listApprovalTiers();
}

async function getRequiredApprovals(totalAmount: number) {
  const tier = await prisma.procurementApprovalTier.findFirst({ where: { minimumTotal: { lte: totalAmount } }, orderBy: { minimumTotal: "desc" } });
  return tier?.requiredApprovals ?? 1;
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
  items: { itemId?: string; description: string; quantity: number; unitPrice: number }[];
  userId: string;
}) {
  if (input.items.length === 0) throw new AppError(400, "PRC-001", "At least one line is required");
  const subtotal = input.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount = Math.round(subtotal * 0.15 * 100) / 100;
  const totalAmount = subtotal + taxAmount;
  const poNumber = await nextDocumentNumber("PO");

  const requiredApprovals = await getRequiredApprovals(totalAmount);
  const status = PurchaseOrderStatus.PENDING_APPROVAL;

  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber,
      supplierId: input.supplierId,
      subtotal,
      taxAmount,
      totalAmount,
      status,
      requiredApprovals,
      createdById: input.userId,
      items: { create: input.items },
    },
    include: { supplier: true, items: true },
  });
  await writeAuditLog({ userId: input.userId, module: "Procurement", action: "PO_CREATED", entityType: "PurchaseOrder", entityId: po.id, details: { poNumber, totalAmount, requiredApprovals } });
  return po;
}

export async function approvePurchaseOrder(id: string, userId: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true, requisition: true } });
  if (!po) throw new AppError(404, "PRC-004", "Purchase order not found");
  if (po.status !== PurchaseOrderStatus.PENDING_APPROVAL) throw new AppError(400, "PRC-010", "Only a pending purchase order can be approved");
  if (po.createdById === userId) {
    throw new AppError(400, "PRC-003", "Creator cannot be the final PO approver");
  }
  if (po.requisition?.requesterUserId === userId) throw new AppError(400, "PRC-003", "Requisition requester cannot approve the resulting purchase order");
  const total = Number(po.totalAmount);
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.purchaseOrder.findUnique({ where: { id }, include: { approvals: true } });
    if (!current || current.status !== PurchaseOrderStatus.PENDING_APPROVAL) throw new AppError(409, "PRC-010", "Purchase order approval status changed; refresh and try again");
    if (current.approvals.some((approval) => approval.userId === userId)) throw new AppError(409, "PRC-020", "You have already approved this purchase order");
    await tx.purchaseOrderApproval.create({ data: { purchaseOrderId: id, userId } });
    const approvalCount = current.approvals.length + 1;
    const isApproved = approvalCount >= current.requiredApprovals;
    return tx.purchaseOrder.update({ where: { id }, data: isApproved ? { status: PurchaseOrderStatus.SENT_TO_SUPPLIER, approvedById: userId } : {}, include: { supplier: true, items: true, approvals: { include: { user: { select: { id: true, fullName: true } } } } } });
  });
  await writeAuditLog({
    userId,
    module: "Procurement",
    action: "PO_APPROVED",
    entityType: "PurchaseOrder",
    entityId: id,
    details: { poNumber: po.poNumber, total, approvalsReceived: updated.approvals.length, approvalsRequired: updated.requiredApprovals, status: updated.status },
  });
  return updated;
}

export async function createSupplierQuote(input: { purchaseOrderId: string; supplierId: string; quoteNumber: string; lines: { purchaseOrderItemId: string; quotedQuantity: number; quotedUnitPrice: number }[]; userId: string }) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId }, include: { items: true, approvals: true } });
  if (!po) throw new AppError(404, "PRC-004", "Purchase order not found");
  if (po.status !== PurchaseOrderStatus.PENDING_APPROVAL || po.approvals.length) throw new AppError(409, "PRC-021", "Supplier quotes can only be recorded before purchase order approval begins");
  const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, isActive: true } });
  if (!supplier) throw new AppError(400, "PRC-022", "Select an active supplier");
  if (!input.lines.length || new Set(input.lines.map((line) => line.purchaseOrderItemId)).size !== input.lines.length || input.lines.length !== po.items.length) throw new AppError(400, "PRC-023", "Quote must contain every purchase order line exactly once");
  const lines = input.lines.map((line) => {
    const poLine = po.items.find((item) => item.id === line.purchaseOrderItemId);
    if (!poLine) throw new AppError(400, "PRC-005", "Quote line does not belong to this purchase order");
    if (line.quotedQuantity !== Number(poLine.quantity) || !Number.isFinite(line.quotedUnitPrice) || line.quotedUnitPrice < 0) throw new AppError(400, "PRC-025", "Quoted quantities must match the order and quoted prices must be valid");
    return { ...line, lineAmount: Math.round(line.quotedQuantity * line.quotedUnitPrice * 100) / 100 };
  });
  const totalAmount = lines.reduce((sum, line) => sum + line.lineAmount, 0);
  const quote = await prisma.supplierQuote.create({ data: { purchaseOrderId: po.id, supplierId: supplier.id, quoteNumber: input.quoteNumber.trim(), totalAmount, lines: { create: lines } }, include: { supplier: true, lines: true } });
  await writeAuditLog({ userId: input.userId, module: "Procurement", action: "SUPPLIER_QUOTE_RECORDED", entityType: "SupplierQuote", entityId: quote.id, details: { purchaseOrderId: po.id, supplierId: supplier.id, quoteNumber: quote.quoteNumber, totalAmount } });
  return quote;
}

export async function selectSupplierQuote(input: { purchaseOrderId: string; quoteId: string; userId: string }) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId }, include: { approvals: true } });
  if (!po) throw new AppError(404, "PRC-004", "Purchase order not found");
  if (po.status !== PurchaseOrderStatus.PENDING_APPROVAL || po.approvals.length) throw new AppError(409, "PRC-021", "A quote cannot be selected after purchase order approval begins");
  const quote = await prisma.supplierQuote.findFirst({ where: { id: input.quoteId, purchaseOrderId: po.id }, include: { lines: true } });
  if (!quote) throw new AppError(404, "PRC-026", "Supplier quote not found for this purchase order");
  const subtotal = Number(quote.totalAmount);
  const taxAmount = Math.round(subtotal * 0.15 * 100) / 100;
  const requiredApprovals = await getRequiredApprovals(subtotal + taxAmount);
  await prisma.$transaction(async (tx) => {
    await tx.supplierQuote.updateMany({ where: { purchaseOrderId: po.id }, data: { isSelected: false } });
    await tx.supplierQuote.update({ where: { id: quote.id }, data: { isSelected: true } });
    for (const line of quote.lines) await tx.purchaseOrderItem.update({ where: { id: line.purchaseOrderItemId }, data: { unitPrice: line.quotedUnitPrice } });
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { supplierId: quote.supplierId, subtotal, taxAmount, totalAmount: subtotal + taxAmount, requiredApprovals } });
  });
  await writeAuditLog({ userId: input.userId, module: "Procurement", action: "SUPPLIER_QUOTE_SELECTED", entityType: "SupplierQuote", entityId: quote.id, details: { purchaseOrderId: po.id, supplierId: quote.supplierId, subtotal, taxAmount, requiredApprovals } });
  return prisma.purchaseOrder.findUnique({ where: { id: po.id }, include: { supplier: true, items: true, supplierQuotes: { include: { supplier: true, lines: true }, orderBy: { totalAmount: "asc" } } } });
}

export async function receiveGrn(input: {
  purchaseOrderId: string;
  storeLocationId: string;
  lines: { purchaseOrderItemId: string; quantity: number }[];
  invoiceReference?: string;
  userId: string;
}) {
  if (!input.lines.length) throw new AppError(400, "PRC-001", "At least one received line is required");
  if (new Set(input.lines.map((line) => line.purchaseOrderItemId)).size !== input.lines.length) throw new AppError(400, "PRC-011", "A PO line can only appear once per GRN");
  const grnNumber = await nextDocumentNumber("GRN");
  const grn = await prisma.$transaction(async (tx) => {
    const lock = await tx.purchaseOrder.updateMany({ where: { id: input.purchaseOrderId, status: { in: [PurchaseOrderStatus.SENT_TO_SUPPLIER, PurchaseOrderStatus.PARTIALLY_RECEIVED] } }, data: { updatedAt: new Date() } });
    if (!lock.count) {
      const existing = await tx.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId }, select: { id: true } });
      if (!existing) throw new AppError(404, "PRC-004", "Purchase order not found");
      throw new AppError(400, "PRC-012", "Only an approved and open purchase order can receive goods");
    }
    const po = await tx.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId }, include: { items: true } });
    if (!po) throw new AppError(404, "PRC-004", "Purchase order not found");
    const quantities = new Map<string, number>();
    for (const line of input.lines) {
      const poi = po.items.find((item) => item.id === line.purchaseOrderItemId);
      if (!poi) throw new AppError(400, "PRC-005", "PO line not found");
      if (!Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > Number(poi.quantity) - Number(poi.receivedQty)) throw new AppError(400, "PRC-006", "Received quantity exceeds remaining ordered quantity");
      const changed = await tx.purchaseOrderItem.updateMany({ where: { id: poi.id, receivedQty: poi.receivedQty }, data: { receivedQty: { increment: line.quantity } } });
      if (changed.count !== 1) throw new AppError(409, "PRC-013", "Received quantity changed; reload the purchase order");
      quantities.set(poi.id, Number(poi.receivedQty) + line.quantity);
    }
    const fullyReceived = po.items.every((poi) => (quantities.get(poi.id) ?? Number(poi.receivedQty)) >= Number(poi.quantity));
    const note = await tx.goodsReceivedNote.create({ data: { grnNumber, purchaseOrderId: po.id, supplierId: po.supplierId, receivedDate: new Date(), receivedByUserId: input.userId, invoiceReference: input.invoiceReference, isFullyReceived: fullyReceived } });
    for (const line of input.lines) {
      const poi = po.items.find((item) => item.id === line.purchaseOrderItemId)!;
      if (poi.itemId) await receiveStockInTransaction(tx, { itemId: poi.itemId, storeLocationId: input.storeLocationId, quantity: line.quantity, unitCost: Number(poi.unitPrice), referenceDocument: grnNumber, userId: input.userId });
    }
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: fullyReceived ? PurchaseOrderStatus.COMPLETED : PurchaseOrderStatus.PARTIALLY_RECEIVED } });
    return note;
  });
  await writeAuditLog({ userId: input.userId, module: "Procurement", action: "GRN_POSTED", entityType: "GoodsReceivedNote", entityId: grn.id, details: { grnNumber, purchaseOrderId: input.purchaseOrderId, lines: input.lines, invoiceReference: input.invoiceReference } });
  return prisma.goodsReceivedNote.findUnique({ where: { id: grn.id }, include: { purchaseOrder: true } });
}

export async function validateInvoiceMatch(input: {
  purchaseOrderId: string;
  invoiceNumber: string;
  lines: { purchaseOrderItemId: string; billedQuantity: number; billedUnitPrice: number }[];
  taxAmount?: number;
  userId: string;
}) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: input.purchaseOrderId },
    include: { items: true, grns: true, supplier: true },
  });
  if (!po) throw new AppError(404, "PRC-004", "Purchase order not found");
  if (!input.lines.length) throw new AppError(400, "PRC-014", "At least one invoice line is required");
  if (new Set(input.lines.map((line) => line.purchaseOrderItemId)).size !== input.lines.length) throw new AppError(400, "PRC-015", "An invoice can only contain one line per PO line");
  if (po.status !== PurchaseOrderStatus.COMPLETED && po.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED) throw new AppError(400, "PRC-016", "Supplier invoices can only be matched after goods have been received");
  const lines = input.lines.map((line) => {
    const poLine = po.items.find((item) => item.id === line.purchaseOrderItemId);
    if (!poLine) throw new AppError(400, "PRC-005", "Invoice line does not belong to the selected purchase order");
    if (!Number.isFinite(line.billedQuantity) || line.billedQuantity <= 0 || !Number.isFinite(line.billedUnitPrice) || line.billedUnitPrice < 0) throw new AppError(400, "PRC-017", "Invoice quantities and prices must be valid");
    const quantityVariance = line.billedQuantity > Number(poLine.receivedQty) + 0.001;
    const priceVariance = Math.abs(line.billedUnitPrice - Number(poLine.unitPrice)) / Math.max(Number(poLine.unitPrice), 0.01) > 0.02;
    return { ...line, poLine, quantityVariance, priceVariance, lineAmount: Math.round(line.billedQuantity * line.billedUnitPrice * 100) / 100 };
  });
  const matched = lines.every((line) => !line.quantityVariance && !line.priceVariance);
  const netAmount = lines.reduce((sum, line) => sum + line.lineAmount, 0);
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
      lines: { create: lines.map((line) => ({ purchaseOrderItemId: line.purchaseOrderItemId, billedQuantity: line.billedQuantity, billedUnitPrice: line.billedUnitPrice, lineAmount: line.lineAmount, quantityVariance: line.quantityVariance, priceVariance: line.priceVariance })) },
    },
    include: { supplier: true, purchaseOrder: true, lines: { include: { purchaseOrderItem: true } } },
  });
  await writeAuditLog({ userId: input.userId, module: "Procurement", action: matched ? "INVOICE_MATCH_PASSED" : "INVOICE_MATCH_FAILED", entityType: "SupplierInvoice", entityId: invoice.id, details: { purchaseOrderId: po.id, lines: lines.map((line) => ({ purchaseOrderItemId: line.purchaseOrderItemId, receivedQuantity: Number(line.poLine.receivedQty), billedQuantity: line.billedQuantity, orderedUnitPrice: Number(line.poLine.unitPrice), billedUnitPrice: line.billedUnitPrice, quantityVariance: line.quantityVariance, priceVariance: line.priceVariance })) } });
  return { matched, invoice, checks: lines.map((line) => ({ purchaseOrderItemId: line.purchaseOrderItemId, quantityOk: !line.quantityVariance, priceOk: !line.priceVariance, receivedQuantity: Number(line.poLine.receivedQty) })) };
}

export async function listSupplierInvoices() {
  return prisma.supplierInvoice.findMany({ include: { supplier: true, purchaseOrder: true, lines: { include: { purchaseOrderItem: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
}
