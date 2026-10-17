import { DocumentModule, FolioLineType, FolioStatus, GuestServicePriority, GuestServiceStatus, GuestServiceType, PosOrderStatus, PosPaymentMethod, ReservationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { nextDocumentNumber, writeAuditLog } from "./system.service.js";
import { calculateFolioBalance } from "./folio.service.js";
import { taxFieldsForCharge } from "../lib/tax.js";

export function isServiceManager(roleName: string) {
  return /supervisor|administrator|manager/i.test(roleName);
}

export async function listCatalog() {
  return prisma.serviceCatalogItem.findMany({ where: { isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }] });
}

export async function listActiveRequests(runnerUserId?: string) {
  return prisma.guestServiceOrder.findMany({
    where: { status: { notIn: ["COMPLETED", "CANCELLED"] }, ...(runnerUserId ? { runnerUserId } : {}) },
    include: {
      reservation: { include: { guest: true, room: true } },
      laundryItems: true,
      transitLogs: true,
      runner: { select: { id: true, fullName: true } },
      posOrder: { include: { items: { include: { menuItem: true } } } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
}

export async function listServiceRunners() {
  return prisma.user.findMany({
    where: { isActive: true, OR: [{ department: { name: { contains: "Guest Services", mode: "insensitive" } } }, { role: { name: { contains: "Runner", mode: "insensitive" } } }, { role: { name: { contains: "Driver", mode: "insensitive" } } }] },
    select: { id: true, fullName: true, role: { select: { name: true } } }, orderBy: { fullName: "asc" },
  });
}

export async function listRoomServiceMenu() {
  const outlet = await prisma.posOutlet.findUnique({ where: { code: "RESTAURANT" }, include: { menuItems: { where: { isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }] } } });
  if (!outlet?.isActive) throw new AppError(404, "GSV-006", "Restaurant POS menu is unavailable");
  return { outlet: { id: outlet.id, name: outlet.name }, items: outlet.menuItems };
}

export async function setReservationCashOnly(reservationId: string, cashOnly: boolean, userId: string, ipAddress?: string) {
  const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!reservation) throw new AppError(404, "GSV-001", "Reservation not found");
  if (reservation.status !== ReservationStatus.CHECKED_IN) throw new AppError(400, "GSV-002", "Guest must be checked in to change the service payment policy");
  const updated = await prisma.reservation.update({ where: { id: reservationId }, data: { cashOnly } });
  await writeAuditLog({ userId, module: "GuestServices", action: "RESERVATION_CASH_ONLY_CHANGED", entityType: "Reservation", entityId: reservationId, details: { cashOnly, previous: reservation.cashOnly }, ipAddress });
  return updated;
}

export async function setReservationCashOnlyForRole(reservationId: string, cashOnly: boolean, userId: string, roleName: string, ipAddress?: string) {
  if (!isServiceManager(roleName)) throw new AppError(403, "GSV-010", "Only a service supervisor can change payment policy");
  return setReservationCashOnly(reservationId, cashOnly, userId, ipAddress);
}

export async function createServiceOrder(input: {
  reservationId: string;
  serviceType: GuestServiceType;
  priority?: GuestServicePriority;
  catalogItemId?: string;
  totalCharge?: number;
  specialInstructions?: string;
  laundryItems?: { itemName: string; quantity: number; unitPrice: number; serviceOption?: "WASH_AND_FOLD" | "IRON" | "DRY_CLEAN" }[];
  posItems?: { menuItemId: string; quantity: number; modifierDetails?: string[] }[];
  runnerUserId?: string;
  transit?: { passengerName: string; transitType: "AIRPORT_PICKUP" | "SHUTTLE_DROP" | "TOURS"; scheduledTime: string; vehiclePlateNumber?: string };
  userId: string;
  ipAddress?: string;
}) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: input.reservationId },
    include: { room: true },
  });
  if (!reservation) throw new AppError(404, "GSV-001", "Reservation not found");
  if (reservation.status !== ReservationStatus.CHECKED_IN) {
    throw new AppError(400, "GSV-002", "Guest must be checked in to log services");
  }

  let catalogCharge = 0;
  if (input.catalogItemId) {
    const item = await prisma.serviceCatalogItem.findUnique({ where: { id: input.catalogItemId } });
    if (!item?.isActive) throw new AppError(404, "GSV-005", "Service catalog item not found");
    catalogCharge = Number(item.price);
  }

  const laundryTotal = (input.laundryItems ?? []).reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  let totalCharge = input.totalCharge ?? (catalogCharge || laundryTotal);
  let posOrderData: { orderNumber: string; outletId: string; items: { menuItemId: string; quantity: number; unitPrice: number; subtotal: number; taxRate: number; modifierDetails: string[] }[]; subTotal: number; taxAmount: number; totalAmount: number } | undefined;
  if (input.serviceType === GuestServiceType.ROOM_SERVICE) {
    if (!input.posItems?.length) throw new AppError(400, "GSV-008", "Add at least one menu item to a room-service order");
    const outlet = await prisma.posOutlet.findUnique({ where: { code: "RESTAURANT" } });
    if (!outlet?.isActive) throw new AppError(404, "GSV-006", "Restaurant POS outlet is unavailable");
    const ids = input.posItems.map((item) => item.menuItemId);
    const menuItems = await prisma.menuItem.findMany({ where: { id: { in: ids }, outletId: outlet.id, isActive: true } });
    if (menuItems.length !== new Set(ids).size) throw new AppError(400, "GSV-009", "Room-service menu contains unavailable or duplicate items");
    const menuById = new Map(menuItems.map((item) => [item.id, item]));
    const lines = input.posItems.map((line) => {
      const item = menuById.get(line.menuItemId)!;
      return { menuItemId: item.id, quantity: line.quantity, unitPrice: Number(item.price), subtotal: Math.round(Number(item.price) * line.quantity * 100) / 100, taxRate: Number(item.taxRate), modifierDetails: line.modifierDetails ?? [] };
    });
    const subTotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
    const taxAmount = Math.round(lines.reduce((sum, line) => sum + line.subtotal * line.taxRate, 0) * 100) / 100;
    totalCharge = Math.round((subTotal + taxAmount) * 100) / 100;
    posOrderData = { orderNumber: await nextDocumentNumber(DocumentModule.POS_ORDERS), outletId: outlet.id, items: lines, subTotal, taxAmount, totalAmount: totalCharge };
  }
  const serviceNumber = await nextDocumentNumber(DocumentModule.GUEST_SERVICES);
  const order = await prisma.$transaction(async (tx) => {
    const posOrder = posOrderData ? await tx.posOrder.create({
      data: { orderNumber: posOrderData.orderNumber, outletId: posOrderData.outletId, cashierUserId: input.userId, tableNumber: reservation.room ? `ROOM ${reservation.room.number}` : "ROOM SERVICE", subTotal: posOrderData.subTotal, taxAmount: posOrderData.taxAmount, totalAmount: posOrderData.totalAmount, reservationId: reservation.id, roomNumber: reservation.room?.number, items: { create: posOrderData.items.map(({ taxRate: _taxRate, ...line }) => line) } },
    }) : null;
    return tx.guestServiceOrder.create({
      data: {
        serviceNumber, reservationId: input.reservationId, catalogItemId: input.catalogItemId,
        serviceType: input.serviceType, priority: input.priority ?? GuestServicePriority.NORMAL,
        runnerUserId: input.runnerUserId, status: input.runnerUserId ? GuestServiceStatus.DISPATCHED : GuestServiceStatus.RECEIVED,
        posOrderId: posOrder?.id, totalCharge, specialInstructions: input.specialInstructions,
        createdById: input.userId, laundryItems: input.laundryItems ? { create: input.laundryItems } : undefined,
        transitLogs: input.transit ? { create: { ...input.transit, scheduledTime: new Date(input.transit.scheduledTime), driverUserId: input.runnerUserId } } : undefined,
      },
      include: { laundryItems: true, transitLogs: true, posOrder: { include: { items: { include: { menuItem: true } } } }, reservation: { include: { guest: true, room: true } } },
    });
  });
  await writeAuditLog({ userId: input.userId, module: "GuestServices", action: "SERVICE_ORDER_CREATED", entityType: "GuestServiceOrder", entityId: order.id, details: { serviceNumber, serviceType: order.serviceType, priority: order.priority, posOrderNumber: posOrderData?.orderNumber }, ipAddress: input.ipAddress });
  if (posOrderData) await writeAuditLog({ userId: input.userId, module: "POS", action: "ROOM_SERVICE_KITCHEN_ORDER_CREATED", entityType: "PosOrder", entityId: order.posOrderId ?? undefined, details: { orderNumber: posOrderData.orderNumber, serviceNumber }, ipAddress: input.ipAddress });
  return order;
}

export async function assignRunner(id: string, runnerUserId: string, userId: string, roleName: string, ipAddress?: string) {
  if (!isServiceManager(roleName)) throw new AppError(403, "GSV-010", "Only a service supervisor can dispatch requests");
  const runner = await prisma.user.findFirst({ where: { id: runnerUserId, isActive: true, OR: [{ department: { name: { contains: "Guest Services", mode: "insensitive" } } }, { role: { name: { contains: "Runner", mode: "insensitive" } } }, { role: { name: { contains: "Driver", mode: "insensitive" } } }] } });
  if (!runner) throw new AppError(400, "GSV-007", "Select an active guest services runner or driver");
  const existing = await prisma.guestServiceOrder.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "GSV-003", "Service order not found");
  if (existing.status === GuestServiceStatus.COMPLETED || existing.status === GuestServiceStatus.CANCELLED) throw new AppError(400, "GSV-011", "Closed service requests cannot be dispatched");
  const order = await prisma.guestServiceOrder.update({
    where: { id },
    data: { runnerUserId, status: GuestServiceStatus.DISPATCHED },
    include: { runner: { select: { fullName: true } } },
  });
  await writeAuditLog({ userId, module: "GuestServices", action: "RUNNER_ASSIGNED", entityType: "GuestServiceOrder", entityId: id, details: { runnerUserId }, ipAddress });
  return order;
}

export async function updateServiceStatus(id: string, status: GuestServiceStatus, userId: string, roleName: string, ipAddress?: string) {
  const manager = isServiceManager(roleName);
  const order = await prisma.guestServiceOrder.findUnique({
    where: { id },
    include: { reservation: { include: { room: true, folios: { include: { lines: true } } } }, posOrder: true },
  });
  if (!order) throw new AppError(404, "GSV-003", "Service order not found");
  if (!manager && order.runnerUserId !== userId) throw new AppError(403, "GSV-012", "You can only update requests assigned to you");
  if (!manager && status !== GuestServiceStatus.IN_PROGRESS && status !== GuestServiceStatus.COMPLETED) throw new AppError(403, "GSV-013", "Runners can only start or complete assigned requests");
  if (order.status === GuestServiceStatus.COMPLETED || order.status === GuestServiceStatus.CANCELLED) throw new AppError(409, "GSV-014", "This service request is already closed");
  const transitions: Record<GuestServiceStatus, GuestServiceStatus[]> = { RECEIVED: [GuestServiceStatus.DISPATCHED, GuestServiceStatus.CANCELLED], DISPATCHED: [GuestServiceStatus.IN_PROGRESS, GuestServiceStatus.CANCELLED], IN_PROGRESS: [GuestServiceStatus.COMPLETED, GuestServiceStatus.CANCELLED], COMPLETED: [], CANCELLED: [] };
  if (!transitions[order.status].includes(status)) throw new AppError(400, "GSV-015", `Cannot transition service from ${order.status} to ${status}`);
  if (status === GuestServiceStatus.COMPLETED && order.reservation.status !== ReservationStatus.CHECKED_IN) throw new AppError(400, "GSV-002", "Guest must remain checked in to complete a service charge");
  const hasCharge = status === GuestServiceStatus.COMPLETED && Number(order.totalCharge) > 0;
  const folio = order.reservation.folios.find((item) => item.status === FolioStatus.OPEN);
  if (hasCharge && !folio) throw new AppError(400, "GSV-004", "No open folio for this reservation");
  if (hasCharge && order.reservation.cashOnly && calculateFolioBalance(folio!.lines) + Number(order.totalCharge) > 0.01) throw new AppError(400, "GSV-016", "This guest is cash-only. Collect sufficient payment before completing this charge.", { balance: calculateFolioBalance(folio!.lines), charge: Number(order.totalCharge) });
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.guestServiceOrder.updateMany({ where: { id: order.id, status: order.status }, data: { status } });
    if (changed.count !== 1) throw new AppError(409, "GSV-017", "Service request changed; refresh and try again");
    if (hasCharge && folio) {
      const tax = order.posOrder
        ? {
            amount: Number(order.posOrder.totalAmount),
            department: "RESTAURANT",
            taxRate: Number(order.posOrder.subTotal) > 0 ? Number(order.posOrder.taxAmount) / Number(order.posOrder.subTotal) : 0,
            netAmount: Number(order.posOrder.subTotal),
            vatAmount: Number(order.posOrder.taxAmount),
            levyAmount: 0,
          }
        : taxFieldsForCharge({ amount: Number(order.totalCharge), department: "SERVICES" });
      await tx.folioLine.create({ data: { folioId: folio.id, lineType: FolioLineType.CHARGE, description: `${order.serviceType} ${order.serviceNumber}`, amount: tax.amount, department: tax.department, taxRate: tax.taxRate, netAmount: tax.netAmount, vatAmount: tax.vatAmount, levyAmount: tax.levyAmount, postedById: userId } });
      if (order.posOrderId) await tx.posOrder.update({ where: { id: order.posOrderId }, data: { status: PosOrderStatus.PAID, paymentMethod: PosPaymentMethod.ROOM_CHARGE, reservationId: order.reservationId, roomNumber: order.reservation.room?.number, closedAt: new Date() } });
    }
    return tx.guestServiceOrder.findUniqueOrThrow({ where: { id: order.id }, include: { reservation: { include: { guest: true, room: true } }, laundryItems: true, transitLogs: true, runner: { select: { fullName: true } }, posOrder: { include: { items: { include: { menuItem: true } } } } } });
  });
  await writeAuditLog({ userId, module: "GuestServices", action: hasCharge ? "SERVICE_CHARGE_POSTED" : "SERVICE_STATUS_CHANGED", entityType: "GuestServiceOrder", entityId: id, details: { previousStatus: order.status, newStatus: status, amount: hasCharge ? Number(order.totalCharge) : undefined }, ipAddress });
  return updated;
}

export async function scheduleTransit(input: {
  reservationId: string;
  passengerName: string;
  transitType: "AIRPORT_PICKUP" | "SHUTTLE_DROP" | "TOURS";
  scheduledTime: string;
  vehiclePlateNumber?: string;
  driverUserId?: string;
  totalCharge?: number;
  priority?: GuestServicePriority;
  userId: string;
  ipAddress?: string;
}) {
  const scheduledTime = new Date(input.scheduledTime);
  if (Number.isNaN(scheduledTime.getTime())) throw new AppError(400, "GSV-018", "Invalid transit schedule time");
  return createServiceOrder({ reservationId: input.reservationId, serviceType: GuestServiceType.TRANSIT, priority: input.priority, totalCharge: input.totalCharge ?? 0, runnerUserId: input.driverUserId, transit: { passengerName: input.passengerName, transitType: input.transitType, scheduledTime: scheduledTime.toISOString(), vehiclePlateNumber: input.vehiclePlateNumber }, userId: input.userId, ipAddress: input.ipAddress });
}

export async function listOverdueHighPriorityConciergeRequests() {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const orders = await prisma.guestServiceOrder.findMany({ where: { serviceType: GuestServiceType.CONCIERGE, priority: GuestServicePriority.HIGH, status: { notIn: [GuestServiceStatus.COMPLETED, GuestServiceStatus.CANCELLED] }, createdAt: { lte: cutoff } }, include: { reservation: { include: { guest: true, room: true } }, runner: { select: { fullName: true } } }, orderBy: { createdAt: "asc" } });
  return orders.map((order) => ({ ...order, overdueMinutes: Math.floor((Date.now() - order.createdAt.getTime()) / 60000) }));
}
