import { FolioLineType, FolioStatus, PosOrderStatus, PosPaymentMethod, PosSessionStatus, ReservationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { nextDocumentNumber, writeAuditLog } from "./system.service.js";
import { postPosCashSale, postRoomChargeToLedger } from "./finance.service.js";

export async function getPosMenu(outletId?: string) {
  const outlets = await prisma.posOutlet.findMany({
    where: { isActive: true },
    include: {
      menuItems: {
        where: { isActive: true },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      },
    },
  });

  if (outletId) {
    const outlet = outlets.find((o) => o.id === outletId);
    if (!outlet) {
      throw new AppError(404, "POS-001", "POS outlet not found");
    }
    return outlet;
  }

  return { outlets };
}

export async function openPosSession(input: {
  outletId: string;
  floatAmount: number;
  userId: string;
  ipAddress?: string;
}) {
  const existing = await prisma.posSession.findFirst({
    where: { outletId: input.outletId, cashierUserId: input.userId, status: PosSessionStatus.OPEN },
  });
  if (existing) {
    throw new AppError(400, "POS-002", "You already have an open session for this outlet");
  }

  const session = await prisma.posSession.create({
    data: {
      outletId: input.outletId,
      cashierUserId: input.userId,
      floatAmount: input.floatAmount,
    },
    include: { outlet: true },
  });

  await writeAuditLog({
    userId: input.userId,
    module: "POS",
    action: "SESSION_OPEN",
    entityType: "PosSession",
    entityId: session.id,
    details: { floatAmount: input.floatAmount },
    ipAddress: input.ipAddress,
  });

  return session;
}

export async function closePosSession(input: {
  sessionId: string;
  closingAmount: number;
  userId: string;
  ipAddress?: string;
}) {
  const session = await prisma.posSession.findUnique({ where: { id: input.sessionId } });
  if (!session) {
    throw new AppError(404, "POS-003", "POS session not found");
  }
  if (session.status === PosSessionStatus.CLOSED) {
    throw new AppError(400, "POS-004", "Session is already closed");
  }

  const openOrders = await prisma.posOrder.count({
    where: { sessionId: session.id, status: PosOrderStatus.OPEN },
  });
  if (openOrders > 0) {
    throw new AppError(400, "POS-005", "Close all open orders before closing the session");
  }

  const updated = await prisma.posSession.update({
    where: { id: session.id },
    data: {
      status: PosSessionStatus.CLOSED,
      closingAmount: input.closingAmount,
      closedAt: new Date(),
    },
    include: { outlet: true },
  });

  await writeAuditLog({
    userId: input.userId,
    module: "POS",
    action: "SESSION_CLOSE",
    entityType: "PosSession",
    entityId: session.id,
    details: { closingAmount: input.closingAmount },
    ipAddress: input.ipAddress,
  });

  return updated;
}

function computeOrderTotals(items: { quantity: number; unitPrice: number; taxRate: number }[]) {
  let subTotal = 0;
  let taxAmount = 0;
  for (const item of items) {
    const lineSub = item.quantity * item.unitPrice;
    subTotal += lineSub;
    taxAmount += lineSub * item.taxRate;
  }
  return {
    subTotal: Math.round(subTotal * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    totalAmount: Math.round((subTotal + taxAmount) * 100) / 100,
  };
}

export async function createPosOrder(input: {
  outletId: string;
  sessionId?: string;
  tableNumber?: string;
  cashierUserId: string;
  items: { menuItemId: string; quantity: number; modifierDetails?: string[] }[];
  ipAddress?: string;
}) {
  if (input.items.length === 0) {
    throw new AppError(400, "POS-006", "Order must have at least one item");
  }

  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: input.items.map((i) => i.menuItemId) }, isActive: true },
  });
  if (menuItems.length !== input.items.length) {
    throw new AppError(404, "POS-007", "One or more menu items not found");
  }

  const menuMap = new Map(menuItems.map((m) => [m.id, m]));
  const lineData = input.items.map((item) => {
    const menu = menuMap.get(item.menuItemId)!;
    const unitPrice = Number(menu.price);
    const taxRate = Number(menu.taxRate);
    return {
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      unitPrice,
      taxRate,
      modifierDetails: item.modifierDetails ?? [],
      subtotal: Math.round(item.quantity * unitPrice * 100) / 100,
    };
  });

  const totals = computeOrderTotals(lineData);
  const orderNumber = await nextDocumentNumber("POS_ORDERS");

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.posOrder.create({
      data: {
        orderNumber,
        outletId: input.outletId,
        sessionId: input.sessionId,
        tableNumber: input.tableNumber,
        cashierUserId: input.cashierUserId,
        subTotal: totals.subTotal,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        items: {
          create: lineData.map((line) => ({
            menuItemId: line.menuItemId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            modifierDetails: line.modifierDetails,
            subtotal: line.subtotal,
          })),
        },
      },
      include: { items: { include: { menuItem: true } }, outlet: true },
    });
    return created;
  });

  await writeAuditLog({
    userId: input.cashierUserId,
    module: "POS",
    action: "ORDER_CREATE",
    entityType: "PosOrder",
    entityId: order.id,
    details: { orderNumber, total: totals.totalAmount },
    ipAddress: input.ipAddress,
  });

  return order;
}

export async function validateRoomCharge(roomNumber: string) {
  const room = await prisma.room.findUnique({
    where: { number: roomNumber },
    include: {
      reservations: {
        where: { status: ReservationStatus.CHECKED_IN },
        include: { guest: true, folios: true },
        take: 1,
      },
    },
  });

  if (!room) {
    throw new AppError(404, "POS-008", "Room not found");
  }

  const reservation = room.reservations[0];
  if (!reservation) {
    throw new AppError(400, "POS-009", "Room is not occupied by a checked-in guest");
  }

  const folio = reservation.folios.find((f) => f.status === "OPEN") ?? reservation.folios[0];

  return {
    valid: true,
    roomNumber: room.number,
    reservationId: reservation.id,
    guestName: `${reservation.guest.firstName} ${reservation.guest.lastName}`,
    folioId: folio?.id,
  };
}

export async function payPosOrder(input: {
  orderId: string;
  paymentMethod: PosPaymentMethod;
  roomNumber?: string;
  userId: string;
  ipAddress?: string;
}) {
  const order = await prisma.posOrder.findUnique({
    where: { id: input.orderId },
    include: { items: { include: { menuItem: true } }, outlet: true },
  });

  if (!order) {
    throw new AppError(404, "POS-010", "Order not found");
  }
  if (order.status === PosOrderStatus.PAID) {
    throw new AppError(400, "POS-011", "Order is already paid");
  }
  if (order.status === PosOrderStatus.VOIDED) {
    throw new AppError(400, "POS-012", "Cannot pay a voided order");
  }

  if (input.paymentMethod === PosPaymentMethod.ROOM_CHARGE) {
    if (!input.roomNumber) {
      throw new AppError(400, "POS-013", "Room number required for room charge");
    }

    const department = order.outlet.code === "LOUNGE" ? "BAR" : "RESTAURANT";
    const description = `POS ${order.outlet.name} — ${order.orderNumber}`;
    const amount = Number(order.totalAmount);
    const netAmount = Number(order.subTotal);
    const taxAmount = Number(order.taxAmount);

    const updated = await prisma.$transaction(async (tx) => {
      const claim = await tx.posOrder.updateMany({
        where: { id: order.id, status: { in: [PosOrderStatus.OPEN, PosOrderStatus.BILL_PRINTED] } },
        data: {
          status: PosOrderStatus.PAID,
          paymentMethod: PosPaymentMethod.ROOM_CHARGE,
          roomNumber: input.roomNumber,
          closedAt: new Date(),
        },
      });
      if (claim.count !== 1) throw new AppError(409, "POS-014", "Order was already paid or changed");

      const room = await tx.room.findUnique({
        where: { number: input.roomNumber! },
        include: { reservations: { where: { status: ReservationStatus.CHECKED_IN }, include: { folios: { include: { lines: true } } }, take: 1 } },
      });
      const reservation = room?.reservations[0];
      if (!room) throw new AppError(404, "POS-008", "Room not found");
      if (!reservation) throw new AppError(400, "POS-009", "Room is not occupied by a checked-in guest");
      if (reservation.cashOnly) throw new AppError(400, "POS-015", "This reservation is marked cash-only");

      const folio = reservation.folios.find((candidate) => candidate.status === FolioStatus.OPEN);
      if (!folio) throw new AppError(400, "POS-016", "No open folio is available for this reservation");
      await tx.folioLine.create({
        data: {
          folioId: folio.id,
          lineType: FolioLineType.CHARGE,
          description,
          amount,
          department,
          taxRate: netAmount > 0 ? taxAmount / netAmount : 0,
          netAmount,
          vatAmount: taxAmount,
          levyAmount: 0,
          postedById: input.userId,
          posOrderId: order.id,
        },
      });

      await tx.posOrder.update({ where: { id: order.id }, data: { reservationId: reservation.id } });

      return tx.posOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: { include: { menuItem: true } } },
      });
    });

    await postRoomChargeToLedger({
      amount: Number(order.totalAmount),
      taxAmount: Number(order.taxAmount),
      netAmount: Number(order.subTotal),
      referenceDocument: order.orderNumber,
      userId: input.userId,
    });

    await writeAuditLog({
      userId: input.userId,
      module: "POS",
      action: "ORDER_ROOM_CHARGE",
      entityType: "PosOrder",
      entityId: order.id,
      details: { roomNumber: input.roomNumber, amount },
      ipAddress: input.ipAddress,
    });

    return updated;
  }

  await postPosCashSale({
    totalAmount: Number(order.totalAmount),
    taxAmount: Number(order.taxAmount),
    netAmount: Number(order.subTotal),
    referenceDocument: order.orderNumber,
    userId: input.userId,
  });

  const updated = await prisma.posOrder.update({
    where: { id: order.id },
    data: {
      status: PosOrderStatus.PAID,
      paymentMethod: input.paymentMethod,
      closedAt: new Date(),
    },
    include: { items: { include: { menuItem: true } } },
  });

  await writeAuditLog({
    userId: input.userId,
    module: "POS",
    action: "ORDER_PAY",
    entityType: "PosOrder",
    entityId: order.id,
    details: { paymentMethod: input.paymentMethod, amount: Number(order.totalAmount) },
    ipAddress: input.ipAddress,
  });

  return updated;
}

export async function listPosOrders(status?: PosOrderStatus) {
  return prisma.posOrder.findMany({
    where: status ? { status } : undefined,
    include: {
      items: { include: { menuItem: true } },
      outlet: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
