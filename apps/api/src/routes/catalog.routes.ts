import { Router } from "express";
import { z } from "zod";
import { ConferenceResourceCategory, RoomStatus } from "@prisma/client";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, validateBody, validateQuery } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import {
  createMenuItem,
  createOutlet,
  createPackage,
  createResource,
  createRoom,
  createRoomType,
  createServiceCatalogItem,
  createVenue,
  listMenuItemsAdmin,
  listOutletsAdmin,
  listPackagesAdmin,
  listResourcesAdmin,
  listRoomsAdmin,
  listRoomTypesAdmin,
  listServiceCatalogAdmin,
  listVenuesAdmin,
  updateMenuItem,
  updateOutlet,
  updatePackage,
  updateResource,
  updateRoom,
  updateRoomType,
  updateServiceCatalogItem,
  updateVenue,
  upsertRatePlan,
} from "../services/catalog.service.js";

export const catalogRouter = Router();
catalogRouter.use(authenticate);

const money = z.coerce.number().min(0);
const bool = z.coerce.boolean().optional();

catalogRouter.get("/room-types", authorize("Reservations", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listRoomTypesAdmin() });
}));

catalogRouter.post("/room-types", authorize("Reservations", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    maxAdults: z.coerce.number().int().min(1),
    maxChildren: z.coerce.number().int().min(0),
    baseRate: money,
  }), req);
  res.status(201).json(await createRoomType({ ...body, userId: req.user!.id }));
}));

catalogRouter.put("/room-types/:id", authorize("Reservations", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    maxAdults: z.coerce.number().int().min(1).optional(),
    maxChildren: z.coerce.number().int().min(0).optional(),
    baseRate: money.optional(),
  }), req);
  res.json(await updateRoomType(paramId(req.params.id), { ...body, userId: req.user!.id }));
}));

catalogRouter.post("/rate-plans", authorize("Revenue", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    roomTypeId: z.string(),
    baseRate: money,
    isActive: bool,
  }), req);
  res.status(201).json(await upsertRatePlan({ ...body, userId: req.user!.id }));
}));

catalogRouter.put("/rate-plans/:id", authorize("Revenue", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    roomTypeId: z.string(),
    baseRate: money,
    isActive: bool,
  }), req);
  res.json(await upsertRatePlan({ id: paramId(req.params.id), ...body, userId: req.user!.id }));
}));

catalogRouter.get("/rooms", authorize("Reservations", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listRoomsAdmin() });
}));

catalogRouter.post("/rooms", authorize("Reservations", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    number: z.string().min(1),
    floor: z.coerce.number().int(),
    roomTypeId: z.string(),
    status: z.nativeEnum(RoomStatus).optional(),
    isActive: bool,
  }), req);
  res.status(201).json(await createRoom({ ...body, userId: req.user!.id }));
}));

catalogRouter.put("/rooms/:id", authorize("Reservations", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    number: z.string().min(1).optional(),
    floor: z.coerce.number().int().optional(),
    roomTypeId: z.string().optional(),
    status: z.nativeEnum(RoomStatus).optional(),
    isActive: bool,
  }), req);
  res.json(await updateRoom(paramId(req.params.id), { ...body, userId: req.user!.id }));
}));

catalogRouter.get("/venues", authorize("Conference", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listVenuesAdmin() });
}));

catalogRouter.post("/venues", authorize("Conference", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    name: z.string().min(1),
    locationDescription: z.string().optional(),
    maxCapacityBanquet: z.coerce.number().int().min(1),
    maxCapacityCinema: z.coerce.number().int().min(1),
    maxCapacityBoardroom: z.coerce.number().int().min(1),
    halfDayRate: money,
    fullDayRate: money,
    isActive: bool,
  }), req);
  res.status(201).json(await createVenue({ ...body, userId: req.user!.id }));
}));

catalogRouter.put("/venues/:id", authorize("Conference", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    name: z.string().min(1).optional(),
    locationDescription: z.string().optional(),
    maxCapacityBanquet: z.coerce.number().int().min(1).optional(),
    maxCapacityCinema: z.coerce.number().int().min(1).optional(),
    maxCapacityBoardroom: z.coerce.number().int().min(1).optional(),
    halfDayRate: money.optional(),
    fullDayRate: money.optional(),
    isActive: bool,
  }), req);
  res.json(await updateVenue(paramId(req.params.id), { ...body, userId: req.user!.id }));
}));

catalogRouter.get("/packages", authorize("Conference", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listPackagesAdmin() });
}));

catalogRouter.post("/packages", authorize("Conference", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    name: z.string().min(1),
    ratePerPax: money,
    details: z.string().optional(),
    isActive: bool,
  }), req);
  res.status(201).json(await createPackage({ ...body, userId: req.user!.id }));
}));

catalogRouter.put("/packages/:id", authorize("Conference", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    name: z.string().min(1).optional(),
    ratePerPax: money.optional(),
    details: z.string().optional(),
    isActive: bool,
  }), req);
  res.json(await updatePackage(paramId(req.params.id), { ...body, userId: req.user!.id }));
}));

catalogRouter.get("/resources", authorize("Conference", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listResourcesAdmin() });
}));

catalogRouter.post("/resources", authorize("Conference", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    name: z.string().min(1),
    totalInventoryCount: z.coerce.number().int().min(0),
    dailyRentalRate: money,
    category: z.nativeEnum(ConferenceResourceCategory),
  }), req);
  res.status(201).json(await createResource({ ...body, userId: req.user!.id }));
}));

catalogRouter.put("/resources/:id", authorize("Conference", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    name: z.string().min(1).optional(),
    totalInventoryCount: z.coerce.number().int().min(0).optional(),
    dailyRentalRate: money.optional(),
    category: z.nativeEnum(ConferenceResourceCategory).optional(),
  }), req);
  res.json(await updateResource(paramId(req.params.id), { ...body, userId: req.user!.id }));
}));

catalogRouter.get("/outlets", authorize("POS", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listOutletsAdmin() });
}));

catalogRouter.post("/outlets", authorize("POS", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    isActive: bool,
  }), req);
  res.status(201).json(await createOutlet({ ...body, userId: req.user!.id }));
}));

catalogRouter.put("/outlets/:id", authorize("POS", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    name: z.string().min(1).optional(),
    isActive: bool,
  }), req);
  res.json(await updateOutlet(paramId(req.params.id), { ...body, userId: req.user!.id }));
}));

catalogRouter.get("/menu-items", authorize("POS", "VIEW"), asyncHandler(async (req, res) => {
  const q = validateQuery(z.object({ outletId: z.string().optional() }), req);
  res.json({ items: await listMenuItemsAdmin(q.outletId) });
}));

catalogRouter.post("/menu-items", authorize("POS", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    outletId: z.string(),
    code: z.string().min(1),
    name: z.string().min(1),
    category: z.string().min(1),
    price: money,
    cost: money.optional(),
    taxRate: z.coerce.number().min(0).max(1).optional(),
    mealPeriod: z.string().optional(),
    isActive: bool,
  }), req);
  res.status(201).json(await createMenuItem({ ...body, userId: req.user!.id }));
}));

catalogRouter.put("/menu-items/:id", authorize("POS", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    outletId: z.string().optional(),
    name: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    price: money.optional(),
    cost: money.optional(),
    taxRate: z.coerce.number().min(0).max(1).optional(),
    mealPeriod: z.string().nullable().optional(),
    isActive: bool,
  }), req);
  res.json(await updateMenuItem(paramId(req.params.id), { ...body, userId: req.user!.id }));
}));

catalogRouter.get("/service-items", authorize("GuestServices", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listServiceCatalogAdmin() });
}));

catalogRouter.post("/service-items", authorize("GuestServices", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    category: z.string().min(1),
    mealPeriod: z.string().optional(),
    price: money,
    taxRate: z.coerce.number().min(0).max(1).optional(),
    isActive: bool,
  }), req);
  res.status(201).json(await createServiceCatalogItem({ ...body, userId: req.user!.id }));
}));

catalogRouter.put("/service-items/:id", authorize("GuestServices", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    name: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    mealPeriod: z.string().nullable().optional(),
    price: money.optional(),
    taxRate: z.coerce.number().min(0).max(1).optional(),
    isActive: bool,
  }), req);
  res.json(await updateServiceCatalogItem(paramId(req.params.id), { ...body, userId: req.user!.id }));
}));
