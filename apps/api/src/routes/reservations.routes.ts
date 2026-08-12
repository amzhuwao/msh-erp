import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, getClientIp, validateBody, validateQuery } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import {
  cancelReservation,
  checkInReservation,
  createReservation,
  searchAvailability,
} from "../services/reservation.service.js";

export const reservationsRouter = Router();

reservationsRouter.use(authenticate);

const availabilityQuerySchema = z.object({
  checkIn: z.string(),
  checkOut: z.string(),
  adults: z.coerce.number().int().min(1).default(1),
});

const createReservationSchema = z.object({
  guestId: z.string().min(1),
  ratePlanId: z.string().min(1),
  roomId: z.string().optional(),
  checkInDate: z.string(),
  checkOutDate: z.string(),
  adults: z.number().int().min(1).default(1),
  children: z.number().int().min(0).default(0),
  specialRequests: z.string().optional(),
});

const checkInSchema = z.object({
  roomId: z.string().min(1),
  nationalId: z.string().optional(),
  passportNumber: z.string().optional(),
});

const cancelSchema = z.object({
  reason: z.string().min(3),
});

const listQuerySchema = z.object({
  status: z.string().optional(),
  checkInFrom: z.string().optional(),
  checkInTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

reservationsRouter.get(
  "/availability",
  authorize("Reservations", "VIEW"),
  asyncHandler(async (req, res) => {
    const query = validateQuery(availabilityQuerySchema, req);
    const checkIn = new Date(query.checkIn);
    const checkOut = new Date(query.checkOut);
    const results = await searchAvailability(checkIn, checkOut, query.adults);
    res.json({ checkIn: query.checkIn, checkOut: query.checkOut, results });
  }),
);

reservationsRouter.get(
  "/",
  authorize("Reservations", "VIEW"),
  asyncHandler(async (req, res) => {
    const query = validateQuery(listQuerySchema, req);
    const where: Record<string, unknown> = {};

    if (query.status) {
      where.status = query.status;
    }
    if (query.checkInFrom || query.checkInTo) {
      where.checkInDate = {
        gte: query.checkInFrom ? new Date(query.checkInFrom) : undefined,
        lte: query.checkInTo ? new Date(query.checkInTo) : undefined,
      };
    }

    const [items, total] = await Promise.all([
      prisma.reservation.findMany({
        where,
        include: {
          guest: true,
          room: { include: { roomType: true } },
          ratePlan: { include: { roomType: true } },
        },
        orderBy: { checkInDate: "asc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.reservation.count({ where }),
    ]);

    res.json({ items, total, page: query.page, limit: query.limit });
  }),
);

reservationsRouter.get(
  "/:id",
  authorize("Reservations", "VIEW"),
  asyncHandler(async (req, res) => {
    const reservation = await prisma.reservation.findUnique({
      where: { id: paramId(req.params.id) },
      include: {
        guest: true,
        room: { include: { roomType: true } },
        ratePlan: { include: { roomType: true } },
        statusHistory: { orderBy: { createdAt: "desc" }, include: { changedBy: true } },
        folios: { include: { lines: true } },
      },
    });

    if (!reservation) {
      throw new AppError(404, "RES-006", "Reservation not found");
    }

    res.json(reservation);
  }),
);

reservationsRouter.post(
  "/",
  authorize("Reservations", "CREATE"),
  asyncHandler(async (req, res) => {
    const body = validateBody(createReservationSchema, req);
    const reservation = await createReservation({
      ...body,
      createdById: req.user!.id,
      ipAddress: getClientIp(req),
    });
    res.status(201).json(reservation);
  }),
);

reservationsRouter.post(
  "/:id/checkin",
  authorize("Reservations", "EDIT"),
  asyncHandler(async (req, res) => {
    const body = validateBody(checkInSchema, req);
    const reservation = await checkInReservation({
      reservationId: paramId(req.params.id),
      ...body,
      userId: req.user!.id,
      ipAddress: getClientIp(req),
    });
    res.json(reservation);
  }),
);

reservationsRouter.post(
  "/:id/cancel",
  authorize("Reservations", "CANCEL"),
  asyncHandler(async (req, res) => {
    const body = validateBody(cancelSchema, req);
    const reservation = await cancelReservation({
      reservationId: paramId(req.params.id),
      reason: body.reason,
      userId: req.user!.id,
      ipAddress: getClientIp(req),
    });
    res.json(reservation);
  }),
);
