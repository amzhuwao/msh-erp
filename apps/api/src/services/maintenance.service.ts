import { TicketPriority, WorkOrderStatus, RoomStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { nextDocumentNumber, writeAuditLog } from "./system.service.js";
import { issueStock } from "./inventory.service.js";

export async function listAssets() {
  return prisma.assetMaster.findMany({ where: { isActive: true }, orderBy: { assetCode: "asc" } });
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
    const created = await tx.maintenanceTicket.create({
      data: {
        ticketNumber,
        reporterUserId: input.userId,
        description: input.description,
        priority: input.priority ?? TicketPriority.MEDIUM,
        roomId: input.roomId,
        assetId: input.assetId,
      },
      include: { room: true, asset: true },
    });
    if (input.priority === TicketPriority.EMERGENCY && input.roomId) {
      await tx.room.update({
        where: { id: input.roomId },
        data: { status: RoomStatus.OUT_OF_ORDER },
      });
    }
    return created;
  });

  await writeAuditLog({
    userId: input.userId,
    module: "Maintenance",
    action: input.priority === "EMERGENCY" ? "ROOM_OUT_OF_ORDER_TRIGGERED" : "MAINTENANCE_TICKET_CREATED",
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
  const wo = await prisma.workOrder.findUnique({ where: { id: input.workOrderId } });
  if (!wo) throw new AppError(404, "MNT-002", "Work order not found");
  const item = await prisma.inventoryItem.findUnique({ where: { id: input.itemId } });
  if (!item) throw new AppError(404, "INV-001", "Inventory item not found");

  await issueStock({
    itemId: input.itemId,
    storeLocationId: input.storeLocationId,
    quantity: input.quantityUsed,
    referenceDocument: wo.woNumber,
    userId: input.userId,
  });

  const unitPrice = Number(item.currentAverageCost);
  const part = await prisma.workOrderPart.create({
    data: {
      workOrderId: wo.id,
      itemId: input.itemId,
      quantityUsed: input.quantityUsed,
      unitPrice,
    },
    include: { item: true },
  });
  await prisma.workOrder.update({
    where: { id: wo.id },
    data: { partsCost: { increment: unitPrice * input.quantityUsed } },
  });
  return part;
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

  const updated = await prisma.$transaction(async (tx) => {
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
    if (wo.ticket.roomId) {
      await tx.room.update({
        where: { id: wo.ticket.roomId },
        data: { status: RoomStatus.VACANT_DIRTY },
      });
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
