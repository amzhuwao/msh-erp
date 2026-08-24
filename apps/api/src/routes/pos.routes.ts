import { Router } from "express";
import { z } from "zod";
import { PosPaymentMethod } from "@prisma/client";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, getClientIp, validateBody, validateQuery } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import {
  closePosSession,
  createPosOrder,
  getPosMenu,
  listPosOrders,
  openPosSession,
  payPosOrder,
  validateRoomCharge,
} from "../services/pos.service.js";

export const posRouter = Router();

posRouter.use(authenticate);

posRouter.get(
  "/menu",
  authorize("POS", "VIEW"),
  asyncHandler(async (req, res) => {
    const query = validateQuery(z.object({ outletId: z.string().optional() }), req);
    res.json(await getPosMenu(query.outletId));
  }),
);

posRouter.get(
  "/orders",
  authorize("POS", "VIEW"),
  asyncHandler(async (req, res) => {
    const query = validateQuery(
      z.object({ status: z.enum(["OPEN", "BILL_PRINTED", "PAID", "VOIDED"]).optional() }),
      req,
    );
    const items = await listPosOrders(query.status);
    res.json({ items });
  }),
);

posRouter.post(
  "/orders",
  authorize("POS", "CREATE"),
  asyncHandler(async (req, res) => {
    const body = validateBody(
      z.object({
        outletId: z.string(),
        sessionId: z.string().optional(),
        tableNumber: z.string().optional(),
        items: z.array(
          z.object({
            menuItemId: z.string(),
            quantity: z.number().int().min(1),
            modifierDetails: z.array(z.string()).optional(),
          }),
        ).min(1),
      }),
      req,
    );
    const order = await createPosOrder({
      ...body,
      cashierUserId: req.user!.id,
      ipAddress: getClientIp(req),
    });
    res.status(201).json(order);
  }),
);

posRouter.post(
  "/orders/:id/pay",
  authorize("POS", "CREATE"),
  asyncHandler(async (req, res) => {
    const body = validateBody(
      z.object({
        paymentMethod: z.enum(["CASH", "CARD", "MOBILE", "ROOM_CHARGE", "BANK_TRANSFER", "ECOCASH", "ONEMONEY"]),
        roomNumber: z.string().optional(),
      }),
      req,
    );
    const order = await payPosOrder({
      orderId: paramId(req.params.id),
      paymentMethod: body.paymentMethod as PosPaymentMethod,
      roomNumber: body.roomNumber,
      userId: req.user!.id,
      ipAddress: getClientIp(req),
    });
    res.json(order);
  }),
);

posRouter.post(
  "/room-charge-validate",
  authorize("POS", "VIEW"),
  asyncHandler(async (req, res) => {
    const body = validateBody(z.object({ roomNumber: z.string().min(1) }), req);
    res.json(await validateRoomCharge(body.roomNumber));
  }),
);

posRouter.post(
  "/orders/:id/room-charge-validate",
  authorize("POS", "VIEW"),
  asyncHandler(async (req, res) => {
    const body = validateBody(z.object({ roomNumber: z.string().min(1) }), req);
    res.json(await validateRoomCharge(body.roomNumber));
  }),
);

posRouter.post(
  "/sessions/open",
  authorize("POS", "CREATE"),
  asyncHandler(async (req, res) => {
    const body = validateBody(
      z.object({ outletId: z.string(), floatAmount: z.number().min(0) }),
      req,
    );
    const session = await openPosSession({
      ...body,
      userId: req.user!.id,
      ipAddress: getClientIp(req),
    });
    res.status(201).json(session);
  }),
);

posRouter.post(
  "/sessions/:id/close",
  authorize("POS", "CREATE"),
  asyncHandler(async (req, res) => {
    const body = validateBody(z.object({ closingAmount: z.number().min(0) }), req);
    const session = await closePosSession({
      sessionId: paramId(req.params.id),
      ...body,
      userId: req.user!.id,
      ipAddress: getClientIp(req),
    });
    res.json(session);
  }),
);
