import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, validateBody } from "../middleware/http.js";

export const corporateRouter = Router();

corporateRouter.use(authenticate);

corporateRouter.get(
  "/profiles",
  authorize("GroupReservations", "VIEW"),
  asyncHandler(async (_req, res) => {
    const items = await prisma.corporateProfile.findMany({
      where: { isActive: true },
      orderBy: { companyName: "asc" },
    });
    res.json({ items });
  }),
);

corporateRouter.post(
  "/profiles",
  authorize("GroupReservations", "CREATE"),
  asyncHandler(async (req, res) => {
    const body = validateBody(
      z.object({
        companyName: z.string().min(1),
        registrationNumber: z.string().optional(),
        contactName: z.string().min(1),
        contactEmail: z.string().email(),
        phone: z.string().optional(),
        creditLimit: z.number().min(0).default(0),
        paymentTermsDays: z.number().int().default(30),
        isCreditApproved: z.boolean().default(false),
      }),
      req,
    );
    const profile = await prisma.corporateProfile.create({ data: body });
    res.status(201).json(profile);
  }),
);
