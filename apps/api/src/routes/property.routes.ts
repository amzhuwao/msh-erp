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

propertyRouter.get(
  "/payment-instructions",
  asyncHandler(async (_req, res) => {
    const { getProperty, paymentInstructions } = await import("../lib/property.js");
    const property = await getProperty();
    res.json(paymentInstructions(property));
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

propertyRouter.put(
  "/",
  authorize("Admin", "EDIT"),
  asyncHandler(async (req, res) => {
    const { z } = await import("zod");
    const { validateBody } = await import("../middleware/http.js");
    const body = validateBody(z.object({
      address: z.string().optional(),
      vatNumber: z.string().optional(),
      bpNumber: z.string().optional(),
      contactEmail: z.string().optional(),
      contactPhone: z.string().optional(),
      netoneNumber: z.string().optional(),
      whatsappNumber: z.string().optional(),
      receptionEmail: z.string().optional(),
      bankName: z.string().optional(),
      bankBranch: z.string().optional(),
      bankAccountName: z.string().optional(),
      bankAccountNumber: z.string().optional(),
      bankSwiftCode: z.string().optional(),
      ecocashNumber: z.string().optional(),
      ecocashMerchant: z.string().optional(),
      onemoneyNumber: z.string().optional(),
    }), req);
    const existing = await prisma.propertyConfiguration.findFirst();
    if (!existing) {
      res.status(404).json({ message: "Property configuration missing" });
      return;
    }
    const updated = await prisma.propertyConfiguration.update({ where: { id: existing.id }, data: body });
    res.json(updated);
  }),
);
