import { TicketPriority, WorkOrderStatus, RoomStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { nextDocumentNumber, writeAuditLog } from "./system.service.js";
import { issueStockInTransaction } from "./inventory.service.js";

export async function listAssets() {
  return prisma.assetMaster.findMany({ include: { preventivePlans: { where: { isActive: true }, orderBy: { nextDueDate: "asc" } } }, orderBy: { assetCode: "asc" } });
}

export async function setAssetActive(input: { id: string; isActive: boolean; userId: string }) {
  const asset = await prisma.$transaction(async (tx) => {
    const updated = await tx.assetMaster.update({ where: { id: input.id }, data: { isActive: input.isActive } });
    if (!input.isActive) await tx.preventiveMaintenancePlan.updateMany({ where: { assetId: input.id, isActive: true }, data: { isActive: false } });
    return updated;
  });
  await writeAuditLog({ userId: input.userId, module: "Maintenance", action: input.isActive ? "ASSET_REACTIVATED" : "ASSET_DEACTIVATED", entityType: "AssetMaster", entityId: asset.id, details: { assetCode: asset.assetCode } });
  return asset;
}

export async function listMaintenanceTechnicians() {
  return prisma.user.findMany({ where: { isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } });
}

export async function createAsset(input: { assetCode: string; name: string; category: string; purchaseDate: string; purchaseCost: number; currentValue: number; depreciationRate?: number; locationDescription?: string; userId: string }) {
  const asset = await prisma.assetMaster.create({ data: { assetCode: input.assetCode, name: input.name, category: input.category, purchaseDate: new Date(`${input.purchaseDate}T00:00:00.000Z`), purchaseCost: input.purchaseCost, currentValue: input.currentValue, depreciationRate: input.depreciationRate, locationDescription: input.locationDescription } });
  await writeAuditLog({ userId: input.userId, module: "Maintenance", action: "ASSET_REGISTERED", entityType: "AssetMaster", entityId: asset.id, details: { assetCode: asset.assetCode, name: asset.name } });
  return asset;
}

export async function listPreventivePlans() {
  return prisma.preventiveMaintenancePlan.findMany({ where: { isActive: true }, include: { asset: true, assignedTechnician: { select: { id: true, fullName: true } }, runs: { include: { ticket: { include: { workOrders: true } } }, orderBy: { dueDate: "desc" }, take: 5 } }, orderBy: { nextDueDate: "asc" } });
}

export async function createPreventivePlan(input: { planName: string; description: string; assetId: string; intervalDays: number; nextDueDate: string; assignedTechnicianId: string; userId: string }) {
  const [asset, technician] = await Promise.all([
    prisma.assetMaster.findFirst({ where: { id: input.assetId, isActive: true } }),
    prisma.user.findFirst({ where: { id: input.assignedTechnicianId, isActive: true } }),
  ]);
  if (!asset) throw new AppError(400, "MNT-010", "Select an active asset for the preventive plan");
  if (!technician) throw new AppError(400, "MNT-011", "Select an active technician");
  const plan = await prisma.preventiveMaintenancePlan.create({ data: { planName: input.planName, description: input.description, assetId: asset.id, intervalDays: input.intervalDays, nextDueDate: new Date(`${input.nextDueDate}T00:00:00.000Z`), assignedTechnicianId: technician.id } });
  await writeAuditLog({ userId: input.userId, module: "Maintenance", action: "PREVENTIVE_PLAN_CREATED", entityType: "PreventiveMaintenancePlan", entityId: plan.id, details: { planName: plan.planName, assetId: asset.id, intervalDays: plan.intervalDays, nextDueDate: input.nextDueDate } });
  return plan;
}

export async function generateDuePreventiveWorkOrders(input: { userId: string }) {
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const duePlans = await prisma.preventiveMaintenancePlan.findMany({ where: { isActive: true, nextDueDate: { lte: todayUtc } }, include: { asset: true } });
  const generated: { planId: string; ticketNumber: string; workOrderNumber: string }[] = [];
  for (const plan of duePlans) {
    const ticketNumber = await nextDocumentNumber("MAINTENANCE");
    const woNumber = await nextDocumentNumber("WORK_ORDERS");
    const outcome = await prisma.$transaction(async (tx) => {
      const nextDueDate = new Date(plan.nextDueDate);
      do { nextDueDate.setUTCDate(nextDueDate.getUTCDate() + plan.intervalDays); } while (nextDueDate <= todayUtc);
      const claimed = await tx.preventiveMaintenancePlan.updateMany({ where: { id: plan.id, nextDueDate: plan.nextDueDate, isActive: true }, data: { nextDueDate } });
      if (!claimed.count) return null;
      const ticket = await tx.maintenanceTicket.create({ data: { ticketNumber, reporterUserId: input.userId, assetId: plan.assetId, description: `${plan.planName}: ${plan.description}`, priority: "MEDIUM" } });
      const workOrder = await tx.workOrder.create({ data: { woNumber, ticketId: ticket.id, technicianUserId: plan.assignedTechnicianId!, scheduledDate: todayUtc } });
      await tx.maintenanceTicket.update({ where: { id: ticket.id }, data: { status: "IN_PROGRESS" } });
      await tx.preventiveMaintenanceRun.create({ data: { planId: plan.id, dueDate: plan.nextDueDate, ticketId: ticket.id } });
      return { ticketNumber: ticket.ticketNumber, workOrderNumber: workOrder.woNumber };
    });
    if (outcome) {
      generated.push({ planId: plan.id, ...outcome });
      await writeAuditLog({ userId: input.userId, module: "Maintenance", action: "PREVENTIVE_WORK_ORDER_GENERATED", entityType: "PreventiveMaintenancePlan", entityId: plan.id, details: outcome });
    }
  }
  return { generated, count: generated.length };
}

export async function listPendingTickets() {
  return prisma.maintenanceTicket.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS", "DEFERRED"] } },
    include: { room: true, asset: true, reporter: { select: { fullName: true } }, workOrders: true },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
}

export async function createTicket(input: {
  description: string;
  priority?: TicketPriority;
  roomId?: string;
  assetId?: string;
  userId: string;
}) {
  const ticketNumber = await nextDocumentNumber("MAINTENANCE");
  const ticket = await prisma.$transaction(async (tx) => {
    let applyRoomHold = false;
    if (input.priority === TicketPriority.EMERGENCY && input.roomId) {
      const room = await tx.room.findUnique({ where: { id: input.roomId } });
      if (!room) throw new AppError(404, "MNT-003", "Room not found");
      applyRoomHold = room.status !== RoomStatus.OCCUPIED && room.status !== RoomStatus.OCCUPIED_DIRTY && room.status !== RoomStatus.OUT_OF_ORDER && room.status !== RoomStatus.OUT_OF_SERVICE;
      if (applyRoomHold) await tx.room.update({ where: { id: room.id }, data: { status: RoomStatus.OUT_OF_ORDER } });
    }
    const created = await tx.maintenanceTicket.create({
      data: {
        ticketNumber,
        reporterUserId: input.userId,
        description: input.description,
        priority: input.priority ?? TicketPriority.MEDIUM,
        roomId: input.roomId,
        assetId: input.assetId,
        roomHoldApplied: applyRoomHold,
      },
      include: { room: true, asset: true },
    });
    return created;
  });

  await writeAuditLog({
    userId: input.userId,
    module: "Maintenance",
    action: ticket.roomHoldApplied ? "ROOM_OUT_OF_ORDER_TRIGGERED" : "MAINTENANCE_TICKET_CREATED",
    entityType: "MaintenanceTicket",
    entityId: ticket.id,
    details: { ticketNumber, roomId: input.roomId },
  });
  return ticket;
}

export async function dispatchWorkOrder(input: {
  ticketId: string;
  technicianUserId: string;
  scheduledDate: string;
  userId: string;
}) {
  const ticket = await prisma.maintenanceTicket.findUnique({ where: { id: input.ticketId } });
  if (!ticket) throw new AppError(404, "MNT-001", "Ticket not found");
  if (ticket.status === "RESOLVED" || ticket.status === "CANCELLED") throw new AppError(400, "MNT-004", "Resolved or cancelled tickets cannot be dispatched");
  const existingWorkOrder = await prisma.workOrder.findFirst({ where: { ticketId: ticket.id, status: { in: ["ASSIGNED", "IN_PROGRESS", "ON_HOLD"] } } });
  if (existingWorkOrder) throw new AppError(409, "MNT-005", "This ticket already has an open work order");
  const woNumber = await nextDocumentNumber("WORK_ORDERS");
  const wo = await prisma.$transaction(async (tx) => {
    await tx.maintenanceTicket.update({
      where: { id: ticket.id },
      data: { status: "IN_PROGRESS" },
    });
    return tx.workOrder.create({
      data: {
        woNumber,
        ticketId: ticket.id,
        technicianUserId: input.technicianUserId,
        scheduledDate: new Date(input.scheduledDate),
      },
      include: { ticket: true, technician: { select: { fullName: true } } },
    });
  });
  await writeAuditLog({
    userId: input.userId,
    module: "Maintenance",
    action: "WORK_ORDER_DISPATCHED",
    entityType: "WorkOrder",
    entityId: wo.id,
  });
  return wo;
}

export async function addWorkOrderPart(input: {
  workOrderId: string;
  itemId: string;
  quantityUsed: number;
  storeLocationId: string;
  userId: string;
}) {
  const part = await prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: input.workOrderId } });
    if (!wo) throw new AppError(404, "MNT-002", "Work order not found");
    if (wo.technicianUserId !== input.userId) throw new AppError(403, "MNT-009", "Only the assigned technician can update this work order");
    if (wo.status !== WorkOrderStatus.ASSIGNED && wo.status !== WorkOrderStatus.IN_PROGRESS) throw new AppError(400, "MNT-006", "Parts can only be issued to an active work order");
    const item = await tx.inventoryItem.findUnique({ where: { id: input.itemId } });
    if (!item) throw new AppError(404, "INV-001", "Inventory item not found");
    await issueStockInTransaction(tx, {
      itemId: input.itemId,
      storeLocationId: input.storeLocationId,
      quantity: input.quantityUsed,
      referenceDocument: wo.woNumber,
      userId: input.userId,
    });
    const unitPrice = Number(item.currentAverageCost);
    const created = await tx.workOrderPart.create({ data: { workOrderId: wo.id, itemId: input.itemId, quantityUsed: input.quantityUsed, unitPrice }, include: { item: true } });
    await tx.workOrder.update({ where: { id: wo.id }, data: { partsCost: { increment: unitPrice * input.quantityUsed } } });
    return created;
  });
  await writeAuditLog({ userId: input.userId, module: "Maintenance", action: "WORK_ORDER_PART_ISSUED", entityType: "WorkOrder", entityId: input.workOrderId, details: { itemId: input.itemId, quantity: input.quantityUsed } });
  return part;
}

export async function listWorkOrders(technicianUserId?: string) {
  return prisma.workOrder.findMany({
    where: { status: { in: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.ON_HOLD] }, technicianUserId },
    include: { technician: { select: { id: true, fullName: true } }, ticket: { include: { room: true, asset: true } }, parts: { include: { item: true } } },
    orderBy: { scheduledDate: "asc" },
  });
}

export async function startWorkOrder(id: string, userId: string) {
  const workOrder = await prisma.workOrder.findUnique({ where: { id } });
  if (!workOrder) throw new AppError(404, "MNT-002", "Work order not found");
  if (workOrder.technicianUserId !== userId) throw new AppError(403, "MNT-009", "Only the assigned technician can update this work order");
  const changed = await prisma.workOrder.updateMany({ where: { id, status: WorkOrderStatus.ASSIGNED }, data: { status: WorkOrderStatus.IN_PROGRESS } });
  if (!changed.count) throw new AppError(409, "MNT-007", "Only an assigned work order can be started");
  await writeAuditLog({ userId, module: "Maintenance", action: "WORK_ORDER_STARTED", entityType: "WorkOrder", entityId: id });
  return prisma.workOrder.findUnique({ where: { id }, include: { ticket: true, parts: true } });
}

export async function completeWorkOrder(input: {
  workOrderId: string;
  labourHours?: number;
  notes?: string;
  userId: string;
}) {
  const wo = await prisma.workOrder.findUnique({
    where: { id: input.workOrderId },
    include: { ticket: true },
  });
  if (!wo) throw new AppError(404, "MNT-002", "Work order not found");
  if (wo.technicianUserId !== input.userId) throw new AppError(403, "MNT-009", "Only the assigned technician can update this work order");
  if (wo.status !== WorkOrderStatus.ASSIGNED && wo.status !== WorkOrderStatus.IN_PROGRESS) throw new AppError(409, "MNT-008", "Only an active work order can be completed");

  const updated = await prisma.$transaction(async (tx) => {
    const claim = await tx.workOrder.updateMany({ where: { id: wo.id, status: { in: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS] } }, data: { status: WorkOrderStatus.COMPLETED } });
    if (!claim.count) throw new AppError(409, "MNT-008", "Work order was already completed or changed");
    const result = await tx.workOrder.update({
      where: { id: wo.id },
      data: {
        status: WorkOrderStatus.COMPLETED,
        completionDate: new Date(),
        labourHours: input.labourHours,
        notes: input.notes,
      },
      include: { ticket: { include: { room: true } }, parts: true },
    });
    await tx.maintenanceTicket.update({
      where: { id: wo.ticketId },
      data: { status: "RESOLVED" },
    });
    if (wo.ticket.roomId && wo.ticket.roomHoldApplied) {
      const [otherOpenTickets, checkedInReservations] = await Promise.all([
        tx.maintenanceTicket.count({ where: { id: { not: wo.ticketId }, roomId: wo.ticket.roomId, status: { in: ["OPEN", "IN_PROGRESS", "DEFERRED"] } } }),
        tx.reservation.count({ where: { roomId: wo.ticket.roomId, status: "CHECKED_IN" } }),
      ]);
      if (otherOpenTickets === 0 && checkedInReservations === 0) {
        await tx.room.updateMany({ where: { id: wo.ticket.roomId, status: RoomStatus.OUT_OF_ORDER }, data: { status: RoomStatus.VACANT_DIRTY } });
      }
    }
    return result;
  });
  await writeAuditLog({
    userId: input.userId,
    module: "Maintenance",
    action: "WORK_ORDER_COMPLETED",
    entityType: "WorkOrder",
    entityId: wo.id,
  });
  return updated;
}
