import { InventoryCostMethod, StockTransactionType } from "@prisma/client";
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
  const item = await prisma.inventoryItem.findUnique({ where: { id: input.itemId } });
  if (!item) throw new AppError(404, "INV-001", "Inventory item not found");

  const qty = input.quantity;
  const isOutbound = ["ISSUE", "TRANSFER_OUT"].includes(input.transactionType);
  const signedQty = isOutbound ? -qty : qty;
  const unitCost = input.unitCost ?? Number(item.currentAverageCost);

  return prisma.$transaction(async (tx) => {
    const balance = await tx.stockBalance.upsert({
      where: { itemId_storeLocationId: { itemId: input.itemId, storeLocationId: input.storeLocationId } },
      create: {
        itemId: input.itemId,
        storeLocationId: input.storeLocationId,
        quantityOnHand: 0,
      },
      update: {},
    });

    const current = Number(balance.quantityOnHand);
    if (isOutbound && current < qty && !input.allowNegative) {
      throw new AppError(400, "INV-002", "Insufficient stock at source location");
    }

    const updated = await tx.stockBalance.update({
      where: { id: balance.id },
      data: { quantityOnHand: current + signedQty },
    });

    if (input.transactionType === StockTransactionType.RECEIPT && item.costMethod === InventoryCostMethod.WEIGHTED_AVERAGE) {
      const incomingValue = qty * unitCost;
      const currentValue = current * Number(item.currentAverageCost);
      const newQty = current + qty;
      const newAvg = newQty === 0 ? unitCost : (currentValue + incomingValue) / newQty;
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { currentAverageCost: newAvg },
      });
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

    return updated;
  });
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
  await applyMovement({
    itemId: input.itemId,
    storeLocationId: input.fromLocationId,
    transactionType: StockTransactionType.TRANSFER_OUT,
    quantity: input.quantity,
    referenceDocument: input.referenceDocument,
    userId: input.userId,
  });
  return applyMovement({
    itemId: input.itemId,
    storeLocationId: input.toLocationId,
    transactionType: StockTransactionType.TRANSFER_IN,
    quantity: input.quantity,
    referenceDocument: input.referenceDocument,
    userId: input.userId,
  });
}

export async function reconcileCount(input: {
  itemId: string;
  storeLocationId: string;
  countedQuantity: number;
  referenceDocument: string;
  userId: string;
}) {
  const balance = await prisma.stockBalance.findUnique({
    where: { itemId_storeLocationId: { itemId: input.itemId, storeLocationId: input.storeLocationId } },
  });
  const current = Number(balance?.quantityOnHand ?? 0);
  const delta = input.countedQuantity - current;
  if (delta === 0) return { adjusted: 0, quantityOnHand: current };

  const result = await applyMovement({
    itemId: input.itemId,
    storeLocationId: input.storeLocationId,
    transactionType: StockTransactionType.ADJUSTMENT,
    quantity: Math.abs(delta),
    referenceDocument: input.referenceDocument,
    userId: input.userId,
    allowNegative: true,
  });

  if (delta < 0) {
    await prisma.stockBalance.update({
      where: { itemId_storeLocationId: { itemId: input.itemId, storeLocationId: input.storeLocationId } },
      data: { quantityOnHand: input.countedQuantity },
    });
  }

  await writeAuditLog({
    userId: input.userId,
    module: "Inventory",
    action: "STOCK_ADJUSTMENT",
    entityType: "InventoryItem",
    entityId: input.itemId,
    details: { delta, counted: input.countedQuantity },
  });
  return { adjusted: delta, quantityOnHand: Number(result.quantityOnHand) };
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
