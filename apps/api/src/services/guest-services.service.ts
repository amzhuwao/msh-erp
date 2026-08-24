import { GuestServiceStatus, ReservationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { nextDocumentNumber, writeAuditLog } from "./system.service.js";
import { postFolioCharge } from "./folio.service.js";

export async function listActiveRequests() {
  return prisma.guestServiceOrder.findMany({
    where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
    include: {
      reservation: { include: { guest: true, room: true } },
      laundryItems: true,
      transitLogs: true,
      runner: { select: { fullName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createServiceOrder(input: {
  reservationId: string;
  serviceType: "LAUNDRY" | "ROOM_SERVICE" | "TRANSIT" | "CONCIERGE" | "OTHERS";
  totalCharge?: number;
  specialInstructions?: string;
  laundryItems?: { itemName: string; quantity: number; unitPrice: number; serviceOption?: "WASH_AND_FOLD" | "IRON" | "DRY_CLEAN" }[];
  userId: string;
}) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: input.reservationId },
    include: { folios: true },
  });
  if (!reservation) throw new AppError(404, "GSV-001", "Reservation not found");
  if (reservation.status !== ReservationStatus.CHECKED_IN) {
    throw new AppError(400, "GSV-002", "Guest must be checked in to log services");
  }

  const laundryTotal = (input.laundryItems ?? []).reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const totalCharge = input.totalCharge ?? laundryTotal;
  const serviceNumber = await nextDocumentNumber("GUEST_SERVICES");

  const order = await prisma.guestServiceOrder.create({
    data: {
      serviceNumber,
      reservationId: input.reservationId,
      serviceType: input.serviceType,
      totalCharge,
      specialInstructions: input.specialInstructions,
      createdById: input.userId,
      laundryItems: input.laundryItems ? { create: input.laundryItems } : undefined,
    },
    include: { laundryItems: true, reservation: { include: { guest: true, room: true } } },
  });

  await writeAuditLog({
    userId: input.userId,
    module: "GuestServices",
    action: "SERVICE_ORDER_CREATED",
    entityType: "GuestServiceOrder",
    entityId: order.id,
  });
  return order;
}

export async function assignRunner(id: string, runnerUserId: string, userId: string) {
  const order = await prisma.guestServiceOrder.update({
    where: { id },
    data: { runnerUserId, status: GuestServiceStatus.DISPATCHED },
    include: { runner: { select: { fullName: true } } },
  });
  await writeAuditLog({
    userId,
    module: "GuestServices",
    action: "RUNNER_ASSIGNED",
    entityType: "GuestServiceOrder",
    entityId: id,
  });
  return order;
}

export async function updateServiceStatus(id: string, status: GuestServiceStatus, userId: string) {
  const order = await prisma.guestServiceOrder.findUnique({
    where: { id },
    include: { reservation: { include: { folios: true } } },
  });
  if (!order) throw new AppError(404, "GSV-003", "Service order not found");

  const updated = await prisma.guestServiceOrder.update({
    where: { id },
    data: { status },
    include: { reservation: { include: { guest: true, room: true } }, laundryItems: true },
  });

  if (status === GuestServiceStatus.COMPLETED && Number(order.totalCharge) > 0) {
    const folio = order.reservation.folios.find((f) => f.status === "OPEN") ?? order.reservation.folios[0];
    if (!folio) throw new AppError(400, "GSV-004", "No open folio for this reservation");
    await postFolioCharge({
      folioId: folio.id,
      description: `${order.serviceType} ${order.serviceNumber}`,
      amount: Number(order.totalCharge),
      userId,
    });
    await writeAuditLog({
      userId,
      module: "GuestServices",
      action: "SERVICE_CHARGE_POSTED",
      entityType: "GuestServiceOrder",
      entityId: id,
      details: { amount: Number(order.totalCharge) },
    });
  }
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
  userId: string;
}) {
  const order = await createServiceOrder({
    reservationId: input.reservationId,
    serviceType: "TRANSIT",
    totalCharge: input.totalCharge ?? 0,
    userId: input.userId,
  });
  await prisma.transitLog.create({
    data: {
      orderId: order.id,
      passengerName: input.passengerName,
      transitType: input.transitType,
      scheduledTime: new Date(input.scheduledTime),
      driverUserId: input.driverUserId,
      vehiclePlateNumber: input.vehiclePlateNumber,
    },
  });
  if (input.driverUserId) {
    await prisma.guestServiceOrder.update({
      where: { id: order.id },
      data: { runnerUserId: input.driverUserId, status: "DISPATCHED" },
    });
  }
  return prisma.guestServiceOrder.findUnique({
    where: { id: order.id },
    include: { transitLogs: true, reservation: { include: { guest: true, room: true } } },
  });
}
