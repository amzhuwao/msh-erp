import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/http.js";
import { utcToday } from "../lib/tax.js";
import { setTaxRates } from "../lib/tax.js";

export const propertyRouter = Router();

propertyRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const property = await prisma.propertyConfiguration.findFirst();
    if (property) setTaxRates(Number(property.vatRatePercent), Number(property.ztaLevyRatePercent));
    res.json(property ?? { propertyName: "Manica Skyview Hotel", vatRatePercent: 15, ztaLevyRatePercent: 2 });
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
    const today = utcToday();
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

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
      vatNumber: z.string().nullable().optional(),
      tinNumber: z.string().nullable().optional(),
      bpNumber: z.string().nullable().optional(),
      vatRatePercent: z.number().finite().min(0).max(100).optional(),
      ztaLevyRatePercent: z.number().finite().min(0).max(100).optional(),
      contactEmail: z.string().nullable().optional(),
      contactPhone: z.string().nullable().optional(),
      netoneNumber: z.string().nullable().optional(),
      whatsappNumber: z.string().nullable().optional(),
      receptionEmail: z.string().nullable().optional(),
      bankName: z.string().nullable().optional(),
      bankBranch: z.string().nullable().optional(),
      bankAccountName: z.string().nullable().optional(),
      bankAccountNumber: z.string().nullable().optional(),
      bankSwiftCode: z.string().nullable().optional(),
      ecocashNumber: z.string().nullable().optional(),
      ecocashMerchant: z.string().nullable().optional(),
      onemoneyNumber: z.string().nullable().optional(),
    }), req);
    const existing = await prisma.propertyConfiguration.findFirst();
    if (!existing) {
      res.status(404).json({ message: "Property configuration missing" });
      return;
    }
    const updated = await prisma.propertyConfiguration.update({ where: { id: existing.id }, data: body });
    setTaxRates(Number(updated.vatRatePercent), Number(updated.ztaLevyRatePercent));
    res.json(updated);
  }),
);
