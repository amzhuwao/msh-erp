import { Router } from "express";
import { z } from "zod";
import { VipStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, getClientIp, validateBody, validateQuery } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import { writeAuditLog } from "../services/system.service.js";
import { assertGuestIdentity } from "../lib/identity.js";

export const guestsRouter = Router();

guestsRouter.use(authenticate);

const guestBodySchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  nationality: z.string().min(2, "Nationality is required"),
  nationalId: z.string().optional(),
  passportNumber: z.string().optional(),
  vipStatus: z.nativeEnum(VipStatus).optional(),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (!data.nationalId?.trim() && !data.passportNumber?.trim()) {
    ctx.addIssue({
      code: "custom",
      message: "National ID or passport number is required",
      path: ["nationalId"],
    });
  }
});

const listQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

guestsRouter.get(
  "/",
  authorize("Reservations", "VIEW"),
  asyncHandler(async (req, res) => {
    const query = validateQuery(listQuerySchema, req);
    const where = query.search
      ? {
          OR: [
            { firstName: { contains: query.search, mode: "insensitive" as const } },
            { lastName: { contains: query.search, mode: "insensitive" as const } },
            { email: { contains: query.search, mode: "insensitive" as const } },
            { phone: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.guest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.guest.count({ where }),
    ]);

    res.json({ items, total, page: query.page, limit: query.limit });
  }),
);

guestsRouter.get(
  "/:id",
  authorize("Reservations", "VIEW"),
  asyncHandler(async (req, res) => {
    const guest = await prisma.guest.findUnique({
      where: { id: paramId(req.params.id) },
      include: {
        reservations: {
          orderBy: { checkInDate: "desc" },
          take: 10,
          include: { room: true, ratePlan: true },
        },
      },
    });

    if (!guest) {
      throw new AppError(404, "GST-001", "Guest not found");
    }

    res.json(guest);
  }),
);

guestsRouter.post(
  "/",
  authorize("Reservations", "CREATE"),
  asyncHandler(async (req, res) => {
    const body = validateBody(guestBodySchema, req);
    assertGuestIdentity(body);
    const guest = await prisma.guest.create({ data: body });

    await writeAuditLog({
      userId: req.user!.id,
      module: "Reservations",
      action: "GUEST_CREATE",
      entityType: "Guest",
      entityId: guest.id,
      ipAddress: getClientIp(req),
    });

    res.status(201).json(guest);
  }),
);

guestsRouter.put(
  "/:id",
  authorize("Reservations", "EDIT"),
  asyncHandler(async (req, res) => {
    const body = validateBody(guestBodySchema.partial(), req);
    if (body.nationality !== undefined || body.nationalId !== undefined || body.passportNumber !== undefined) {
      const existing = await prisma.guest.findUnique({ where: { id: paramId(req.params.id) } });
      if (!existing) throw new AppError(404, "GST-001", "Guest not found");
      assertGuestIdentity({
        nationality: body.nationality ?? existing.nationality,
        nationalId: body.nationalId ?? existing.nationalId,
        passportNumber: body.passportNumber ?? existing.passportNumber,
      });
    }
    const guest = await prisma.guest.update({
      where: { id: paramId(req.params.id) },
      data: body,
    });

    await writeAuditLog({
      userId: req.user!.id,
      module: "Reservations",
      action: "GUEST_UPDATE",
      entityType: "Guest",
      entityId: guest.id,
      ipAddress: getClientIp(req),
    });

    res.json(guest);
  }),
);
