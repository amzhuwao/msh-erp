import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/http.js";

export const propertyRouter = Router();

propertyRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const property = await prisma.propertyConfiguration.findFirst();
    res.json(property ?? { propertyName: "Manica Skyview Hotel" });
  }),
);

propertyRouter.use(authenticate);

propertyRouter.get(
  "/dashboard",
  authorize("Reservations", "VIEW"),
  asyncHandler(async (_req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [arrivals, departures, inHouse, roomStats] = await Promise.all([
      prisma.reservation.count({
        where: {
          checkInDate: { gte: today, lt: tomorrow },
          status: { in: ["CONFIRMED", "TENTATIVE"] },
        },
      }),
      prisma.reservation.count({
        where: {
          checkOutDate: { gte: today, lt: tomorrow },
          status: "CHECKED_IN",
        },
      }),
      prisma.reservation.count({ where: { status: "CHECKED_IN" } }),
      prisma.room.groupBy({
        by: ["status"],
        _count: { status: true },
        where: { isActive: true },
      }),
    ]);

    res.json({
      date: today.toISOString().slice(0, 10),
      arrivalsToday: arrivals,
      departuresToday: departures,
      inHouseGuests: inHouse,
      roomStatusBreakdown: roomStats,
    });
  }),
);

propertyRouter.get(
  "/departments",
  authorize("Reservations", "VIEW"),
  asyncHandler(async (_req, res) => {
    const items = await prisma.department.findMany({ orderBy: { name: "asc" } });
    res.json({ items });
  }),
);
