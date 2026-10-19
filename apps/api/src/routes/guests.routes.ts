import { Router } from "express";
import { z } from "zod";
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
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? null : value,
    z.string().trim().email().nullable().optional(),
  ),
  phone: z.string().nullable().optional(),
  nationality: z.string().trim().min(2, "Nationality is required"),
  nationalId: z.string().nullable().optional(),
  passportNumber: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  carRegistration: z.string().nullable().optional(),
  nextOfKin: z.string().nullable().optional(),
  nextOfKinPhone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const guestSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  nationality: true,
  nationalId: true,
  passportNumber: true,
  gender: true,
  companyName: true,
  address: true,
  carRegistration: true,
  nextOfKin: true,
  nextOfKinPhone: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { reservations: true } },
} as const;

function normalizedGuestData(data: z.infer<typeof guestBodySchema>) {
  return {
    ...data,
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    email: data.email?.trim().toLowerCase() || null,
    phone: data.phone?.trim() || null,
    nationality: data.nationality.trim(),
    nationalId: data.nationalId?.trim() || null,
    passportNumber: data.passportNumber?.trim() || null,
    gender: data.gender?.trim() || null,
    companyName: data.companyName?.trim() || null,
    address: data.address?.trim() || null,
    carRegistration: data.carRegistration?.trim() || null,
    nextOfKin: data.nextOfKin?.trim() || null,
    nextOfKinPhone: data.nextOfKinPhone?.trim() || null,
    notes: data.notes?.trim() || null,
  };
}

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
        select: guestSelect,
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
      select: {
        ...guestSelect,
        reservations: {
          orderBy: { checkInDate: "desc" },
          take: 10,
          select: {
            id: true,
            reservationNumber: true,
            status: true,
            checkInDate: true,
            checkOutDate: true,
            room: { select: { number: true } },
          },
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
    const guest = await prisma.guest.create({ data: normalizedGuestData(body), select: guestSelect });

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

guestsRouter.post(
  "/bulk",
  authorize("Reservations", "CREATE"),
  asyncHandler(async (req, res) => {
    const entries = req.body?.guests;
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > 500) {
      throw new AppError(400, "GST-004", "Provide between 1 and 500 guest profiles");
    }

    const results: { row: number; status: "created" | "error"; id?: string; message?: string }[] = [];
    for (const [index, entry] of entries.entries()) {
      const parsed = guestBodySchema.safeParse(entry);
      if (!parsed.success) {
        results.push({ row: index + 2, status: "error", message: parsed.error.issues[0]?.message ?? "Invalid guest profile" });
        continue;
      }
      try {
        assertGuestIdentity(parsed.data);
        const guest = await prisma.guest.create({ data: normalizedGuestData(parsed.data), select: { id: true } });
        await writeAuditLog({
          userId: req.user!.id,
          module: "Reservations",
          action: "GUEST_CREATE",
          entityType: "Guest",
          entityId: guest.id,
          ipAddress: getClientIp(req),
        });
        results.push({ row: index + 2, status: "created", id: guest.id });
      } catch (error) {
        if (error instanceof AppError) {
          results.push({ row: index + 2, status: "error", message: error.message });
        } else if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
          results.push({ row: index + 2, status: "error", message: "Email already exists" });
        } else {
          throw error;
        }
      }
    }

    res.status(201).json({
      created: results.filter((result) => result.status === "created").length,
      failed: results.filter((result) => result.status === "error").length,
      results,
    });
  }),
);

guestsRouter.put(
  "/:id",
  authorize("Reservations", "EDIT"),
  asyncHandler(async (req, res) => {
    const body = validateBody(guestBodySchema.partial(), req);
    const existing = await prisma.guest.findUnique({ where: { id: paramId(req.params.id) } });
    if (!existing) throw new AppError(404, "GST-001", "Guest not found");
    assertGuestIdentity({
      nationality: body.nationality ?? existing.nationality,
      nationalId: body.nationalId === undefined ? existing.nationalId : body.nationalId,
      passportNumber: body.passportNumber === undefined ? existing.passportNumber : body.passportNumber,
    });
    const data = Object.fromEntries(Object.entries(body).map(([key, value]) => [
      key,
      typeof value === "string" ? (key === "email" ? value.trim().toLowerCase() : value.trim() || null) : value,
    ]));
    const guest = await prisma.guest.update({
      where: { id: paramId(req.params.id) },
      data,
      select: guestSelect,
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
