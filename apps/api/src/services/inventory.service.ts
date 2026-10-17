import { InventoryCostMethod, StockCountAdjustmentStatus, StockTransactionType, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { writeAuditLog } from "./system.service.js";

export async function listItems() {
  return prisma.inventoryItem.findMany({
    where: { isActive: true },
    include: { balances: { include: { storeLocation: true } } },
    orderBy: { itemCode: "asc" },
  });
}

export async function listLocations() {
  return prisma.storeLocation.findMany({ where: { isActive: true }, orderBy: { locationName: "asc" } });
}

export async function createItem(input: {
  itemCode: string;
  name: string;
  category: string;
  baseUnitOfMeasure: string;
  reorderLevel?: number;
  reorderQuantity?: number;
  isPerishable?: boolean;
  currentAverageCost?: number;
}) {
  const item = await prisma.inventoryItem.create({
    data: {
      itemCode: input.itemCode,
      name: input.name,
      category: input.category,
      baseUnitOfMeasure: input.baseUnitOfMeasure,
      reorderLevel: input.reorderLevel ?? 0,
      reorderQuantity: input.reorderQuantity ?? 0,
      isPerishable: input.isPerishable ?? false,
      currentAverageCost: input.currentAverageCost ?? 0,
    },
  });
  await writeAuditLog({
    module: "Inventory",
    action: "ITEM_CREATED",
    entityType: "InventoryItem",
    entityId: item.id,
    details: { itemCode: item.itemCode },
  });
  return item;
}

export async function getBalances(locationId?: string) {
  return prisma.stockBalance.findMany({
    where: locationId ? { storeLocationId: locationId } : undefined,
    include: { item: true, storeLocation: true },
    orderBy: { item: { name: "asc" } },
  });
}

export async function lowStockAlerts() {
  const items = await prisma.inventoryItem.findMany({
    where: { isActive: true },
    include: { balances: true },
  });
  return items
    .map((item) => {
      const onHand = item.balances.reduce((s, b) => s + Number(b.quantityOnHand), 0);
      return { ...item, onHand, belowReorder: onHand <= Number(item.reorderLevel) };
    })
    .filter((i) => i.belowReorder);
}

async function applyMovementInTransaction(tx: Prisma.TransactionClient, input: {
  itemId: string;
  storeLocationId: string;
  transactionType: StockTransactionType;
  quantity: number;
  unitCost?: number;
  referenceDocument: string;
  userId: string;
  allowNegative?: boolean;
}) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new AppError(400, "INV-004", "Quantity must be greater than zero");
  if (!input.referenceDocument.trim()) throw new AppError(400, "INV-005", "A source document is required for every stock movement");
  const item = await tx.inventoryItem.findUnique({ where: { id: input.itemId } });
  if (!item) throw new AppError(404, "INV-001", "Inventory item not found");

  const qty = input.quantity;
  const isOutbound = ["ISSUE", "TRANSFER_OUT"].includes(input.transactionType);
  const signedQty = isOutbound ? -qty : qty;
  const unitCost = input.unitCost ?? Number(item.currentAverageCost);

  const balance = await tx.stockBalance.upsert({
    where: { itemId_storeLocationId: { itemId: input.itemId, storeLocationId: input.storeLocationId } },
    create: { itemId: input.itemId, storeLocationId: input.storeLocationId, quantityOnHand: 0 },
    update: {},
  });

  if (isOutbound && !input.allowNegative) {
    const moved = await tx.stockBalance.updateMany({
      where: { id: balance.id, quantityOnHand: { gte: qty } },
      data: { quantityOnHand: { decrement: qty } },
    });
    if (moved.count !== 1) {
      throw new AppError(400, "INV-002", "Insufficient stock at source location");
    }
  } else {
    await tx.stockBalance.update({
      where: { id: balance.id },
      data: { quantityOnHand: { increment: signedQty } },
    });
  }

  if (input.transactionType === StockTransactionType.RECEIPT && item.costMethod === InventoryCostMethod.WEIGHTED_AVERAGE) {
    const current = await tx.stockBalance.aggregate({ where: { itemId: item.id }, _sum: { quantityOnHand: true } });
    const existingQuantity = Number(current._sum.quantityOnHand ?? 0) - qty;
    const incomingValue = qty * unitCost;
    const currentValue = existingQuantity * Number(item.currentAverageCost);
    const newQty = existingQuantity + qty;
    const newAvg = newQty === 0 ? unitCost : (currentValue + incomingValue) / newQty;
    await tx.inventoryItem.update({ where: { id: item.id }, data: { currentAverageCost: newAvg } });
  }

  await tx.stockTransaction.create({
    data: {
      itemId: input.itemId,
      storeLocationId: input.storeLocationId,
      transactionType: input.transactionType,
      quantity: qty,
      unitCost,
      totalCost: qty * unitCost,
      referenceDocument: input.referenceDocument,
      createdById: input.userId,
    },
  });

  return tx.stockBalance.findUniqueOrThrow({ where: { id: balance.id } });
}

export async function receiveStockInTransaction(tx: Prisma.TransactionClient, input: {
  itemId: string;
  storeLocationId: string;
  quantity: number;
  unitCost: number;
  referenceDocument: string;
  userId: string;
}) {
  return applyMovementInTransaction(tx, { ...input, transactionType: StockTransactionType.RECEIPT });
}

export async function issueStockInTransaction(tx: Prisma.TransactionClient, input: {
  itemId: string;
  storeLocationId: string;
  quantity: number;
  referenceDocument: string;
  userId: string;
}) {
  return applyMovementInTransaction(tx, { ...input, transactionType: StockTransactionType.ISSUE });
}

async function applyMovement(input: {
  itemId: string;
  storeLocationId: string;
  transactionType: StockTransactionType;
  quantity: number;
  unitCost?: number;
  referenceDocument: string;
  userId: string;
  allowNegative?: boolean;
}) {
  return prisma.$transaction((tx) => applyMovementInTransaction(tx, input));
}

export async function receiveStock(input: {
  itemId: string;
  storeLocationId: string;
  quantity: number;
  unitCost: number;
  referenceDocument: string;
  userId: string;
}) {
  return applyMovement({ ...input, transactionType: StockTransactionType.RECEIPT });
}

export async function transferStock(input: {
  itemId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  referenceDocument: string;
  userId: string;
}) {
  if (input.fromLocationId === input.toLocationId) {
    throw new AppError(400, "INV-003", "Source and destination must differ");
  }
  const result = await prisma.$transaction(async (tx) => {
    await applyMovementInTransaction(tx, {
      itemId: input.itemId,
      storeLocationId: input.fromLocationId,
      transactionType: StockTransactionType.TRANSFER_OUT,
      quantity: input.quantity,
      referenceDocument: input.referenceDocument,
      userId: input.userId,
    });
    return applyMovementInTransaction(tx, {
      itemId: input.itemId,
      storeLocationId: input.toLocationId,
      transactionType: StockTransactionType.TRANSFER_IN,
      quantity: input.quantity,
      referenceDocument: input.referenceDocument,
      userId: input.userId,
    });
  });
  await writeAuditLog({ userId: input.userId, module: "Inventory", action: "STOCK_TRANSFER", entityType: "InventoryItem", entityId: input.itemId, details: { fromLocationId: input.fromLocationId, toLocationId: input.toLocationId, quantity: input.quantity, referenceDocument: input.referenceDocument } });
  return result;
}

const STOCK_COUNT_THRESHOLD_KEY = "inventory.stockCountApprovalThreshold";

export async function getStockCountApprovalThreshold() {
  const setting = await prisma.globalSetting.upsert({
    where: { key: STOCK_COUNT_THRESHOLD_KEY },
    create: { key: STOCK_COUNT_THRESHOLD_KEY, value: "100", description: "Stock adjustment value requiring secondary approval" },
    update: {},
  });
  return Number(setting.value);
}

export async function setStockCountApprovalThreshold(value: number, userId: string) {
  if (!Number.isFinite(value) || value < 0) throw new AppError(400, "INV-009", "Approval threshold must be zero or greater");
  const setting = await prisma.globalSetting.upsert({
    where: { key: STOCK_COUNT_THRESHOLD_KEY },
    create: { key: STOCK_COUNT_THRESHOLD_KEY, value: String(value), description: "Stock adjustment value requiring secondary approval" },
    update: { value: String(value) },
  });
  await writeAuditLog({ userId, module: "Inventory", action: "STOCK_ADJUSTMENT_THRESHOLD_CHANGED", entityType: "GlobalSetting", entityId: setting.id, details: { value } });
  return { threshold: Number(setting.value) };
}

export async function listPendingStockCountAdjustments() {
  return prisma.stockCountAdjustment.findMany({
    where: { status: StockCountAdjustmentStatus.PENDING_APPROVAL },
    include: { item: true, storeLocation: true, requestedBy: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function reconcileCount(input: {
  itemId: string;
  storeLocationId: string;
  countedQuantity: number;
  referenceDocument: string;
  reason: string;
  userId: string;
}) {
  if (!Number.isFinite(input.countedQuantity) || input.countedQuantity < 0) throw new AppError(400, "INV-006", "Counted quantity must be zero or greater");
  if (!input.reason.trim()) throw new AppError(400, "INV-007", "An explanation is required for a stock count adjustment");
  const threshold = await getStockCountApprovalThreshold();
  const proposal = await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findUnique({ where: { id: input.itemId } });
    if (!item) throw new AppError(404, "INV-001", "Inventory item not found");
    const balance = await tx.stockBalance.upsert({
      where: { itemId_storeLocationId: { itemId: input.itemId, storeLocationId: input.storeLocationId } },
      create: { itemId: input.itemId, storeLocationId: input.storeLocationId, quantityOnHand: 0 },
      update: {},
    });
    const current = Number(balance.quantityOnHand);
    const delta = input.countedQuantity - current;
    if (delta === 0) return { adjustment: null, delta, current, varianceValue: 0 };
    const varianceValue = Math.round(Math.abs(delta) * Number(item.currentAverageCost) * 100) / 100;
    if (varianceValue >= threshold) {
      const adjustment = await tx.stockCountAdjustment.create({
        data: {
          itemId: input.itemId,
          storeLocationId: input.storeLocationId,
          bookQuantity: current,
          countedQuantity: input.countedQuantity,
          adjustmentDelta: delta,
          varianceValue,
          referenceDocument: input.referenceDocument,
          reason: input.reason.trim(),
          requestedById: input.userId,
        },
        include: { item: true, storeLocation: true },
      });
      return { adjustment, delta, current, varianceValue };
    }

    await postStockCountDelta(tx, {
      itemId: input.itemId,
      storeLocationId: input.storeLocationId,
      bookQuantity: current,
      countedQuantity: input.countedQuantity,
      delta,
      referenceDocument: input.referenceDocument,
      reason: input.reason,
      userId: input.userId,
    });
    return { adjustment: null, delta, current, varianceValue };
  });

  if (proposal.delta === 0) return { status: "NO_VARIANCE", adjusted: 0, quantityOnHand: proposal.current };
  if (proposal.adjustment) {
    await writeAuditLog({
      userId: input.userId,
      module: "Inventory",
      action: "STOCK_ADJUSTMENT_SUBMITTED",
      entityType: "StockCountAdjustment",
      entityId: proposal.adjustment.id,
      details: { delta: proposal.delta, varianceValue: proposal.varianceValue, reason: input.reason, referenceDocument: input.referenceDocument },
    });
    return { status: "PENDING_APPROVAL", adjustment: proposal.adjustment, varianceValue: proposal.varianceValue };
  }

  await writeAuditLog({
    userId: input.userId,
    module: "Inventory",
    action: "STOCK_ADJUSTMENT",
    entityType: "InventoryItem",
    entityId: input.itemId,
    details: { delta: proposal.delta, counted: input.countedQuantity, reason: input.reason, referenceDocument: input.referenceDocument, varianceValue: proposal.varianceValue },
  });
  return { status: "POSTED", adjusted: proposal.delta, quantityOnHand: input.countedQuantity };
}

async function postStockCountDelta(tx: Prisma.TransactionClient, input: {
  itemId: string;
  storeLocationId: string;
  bookQuantity: number;
  countedQuantity: number;
  delta: number;
  referenceDocument: string;
  reason: string;
  userId: string;
}) {
  const balance = await tx.stockBalance.findUnique({ where: { itemId_storeLocationId: { itemId: input.itemId, storeLocationId: input.storeLocationId } } });
  if (!balance || Number(balance.quantityOnHand) !== input.bookQuantity) throw new AppError(409, "INV-008", "Stock changed while reconciling; reload the count and try again");
  const changed = await tx.stockBalance.updateMany({
    where: { id: balance.id, quantityOnHand: input.bookQuantity },
    data: { quantityOnHand: input.countedQuantity },
  });
  if (changed.count !== 1) throw new AppError(409, "INV-008", "Stock changed while reconciling; reload the count and try again");
  const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: input.itemId } });
  const unitCost = Number(item.currentAverageCost);
  return tx.stockTransaction.create({
    data: {
      itemId: input.itemId,
      storeLocationId: input.storeLocationId,
      transactionType: StockTransactionType.ADJUSTMENT,
      quantity: Math.abs(input.delta),
      unitCost,
      totalCost: Math.abs(input.delta) * unitCost,
      adjustmentDelta: input.delta,
      referenceDocument: input.referenceDocument,
      notes: input.reason.trim(),
      createdById: input.userId,
    },
  });
}

export async function approveStockCountAdjustment(id: string, userId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const adjustment = await tx.stockCountAdjustment.findUnique({ where: { id } });
    if (!adjustment) throw new AppError(404, "INV-010", "Stock adjustment request not found");
    if (adjustment.status !== StockCountAdjustmentStatus.PENDING_APPROVAL) throw new AppError(409, "INV-011", "Stock adjustment request has already been actioned");
    if (adjustment.requestedById === userId) throw new AppError(403, "INV-012", "The person who counted stock cannot approve their own adjustment");
    const claimed = await tx.stockCountAdjustment.updateMany({ where: { id, status: StockCountAdjustmentStatus.PENDING_APPROVAL }, data: { status: StockCountAdjustmentStatus.POSTED, approvedById: userId } });
    if (!claimed.count) throw new AppError(409, "INV-011", "Stock adjustment request has already been actioned");
    const transaction = await postStockCountDelta(tx, {
      itemId: adjustment.itemId,
      storeLocationId: adjustment.storeLocationId,
      bookQuantity: Number(adjustment.bookQuantity),
      countedQuantity: Number(adjustment.countedQuantity),
      delta: Number(adjustment.adjustmentDelta),
      referenceDocument: adjustment.referenceDocument,
      reason: adjustment.reason,
      userId,
    });
    return tx.stockCountAdjustment.update({ where: { id }, data: { stockTransactionId: transaction.id }, include: { item: true, storeLocation: true } });
  });
  await writeAuditLog({ userId, module: "Inventory", action: "STOCK_ADJUSTMENT_APPROVED", entityType: "StockCountAdjustment", entityId: id, details: { varianceValue: Number(result.varianceValue), delta: Number(result.adjustmentDelta) } });
  return result;
}

export async function rejectStockCountAdjustment(id: string, reason: string, userId: string) {
  const adjustment = await prisma.stockCountAdjustment.findUnique({ where: { id } });
  if (!adjustment) throw new AppError(404, "INV-010", "Stock adjustment request not found");
  if (adjustment.requestedById === userId) throw new AppError(403, "INV-012", "The person who counted stock cannot reject their own adjustment");
  const result = await prisma.stockCountAdjustment.updateMany({
    where: { id, status: StockCountAdjustmentStatus.PENDING_APPROVAL },
    data: { status: StockCountAdjustmentStatus.REJECTED, approvedById: userId, rejectionReason: reason.trim() },
  });
  if (!result.count) throw new AppError(409, "INV-011", "Stock adjustment request has already been actioned");
  await writeAuditLog({ userId, module: "Inventory", action: "STOCK_ADJUSTMENT_REJECTED", entityType: "StockCountAdjustment", entityId: id, details: { reason } });
  return prisma.stockCountAdjustment.findUnique({ where: { id }, include: { item: true, storeLocation: true } });
}

export async function issueStock(input: {
  itemId: string;
  storeLocationId: string;
  quantity: number;
  referenceDocument: string;
  userId: string;
}) {
  return applyMovement({ ...input, transactionType: StockTransactionType.ISSUE });
}
