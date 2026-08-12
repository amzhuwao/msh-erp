import { Router } from "express";
import { RoomStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, validateQuery } from "../middleware/http.js";
import { z } from "zod";

export const roomsRouter = Router();

roomsRouter.use(authenticate);

const listQuerySchema = z.object({
  status: z.nativeEnum(RoomStatus).optional(),
  floor: z.coerce.number().int().optional(),
  roomTypeId: z.string().optional(),
});

roomsRouter.get(
  "/",
  authorize("Reservations", "VIEW"),
  asyncHandler(async (req, res) => {
    const query = validateQuery(listQuerySchema, req);
    const rooms = await prisma.room.findMany({
      where: {
        isActive: true,
        status: query.status,
        floor: query.floor,
        roomTypeId: query.roomTypeId,
      },
      include: {
        roomType: true,
        reservations: {
          where: { status: { in: ["CONFIRMED", "CHECKED_IN", "TENTATIVE"] } },
          orderBy: { checkInDate: "desc" },
          take: 1,
          include: { guest: true },
        },
      },
      orderBy: [{ floor: "asc" }, { number: "asc" }],
    });

    res.json({ items: rooms, total: rooms.length });
  }),
);

roomsRouter.get(
  "/types",
  authorize("Reservations", "VIEW"),
  asyncHandler(async (_req, res) => {
    const roomTypes = await prisma.roomType.findMany({
      include: {
        ratePlans: { where: { isActive: true } },
        _count: { select: { rooms: true } },
      },
      orderBy: { name: "asc" },
    });
    res.json({ items: roomTypes });
  }),
);
