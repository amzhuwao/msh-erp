import { Router } from "express";
import { GuestServicePriority, GuestServiceStatus } from "@prisma/client";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, getClientIp, validateBody } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import {
  assignRunner,
  createServiceOrder,
  listActiveRequests,
  listCatalog,
  listOverdueHighPriorityConciergeRequests,
  listRoomServiceMenu,
  listServiceRunners,
  scheduleTransit,
  setReservationCashOnlyForRole,
  isServiceManager,
  updateServiceStatus,
} from "../services/guest-services.service.js";

export const guestServicesRouter = Router();
guestServicesRouter.use(authenticate);

guestServicesRouter.get("/catalog", authorize("GuestServices", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listCatalog() });
}));

guestServicesRouter.get("/room-service-menu", authorize("GuestServices", "VIEW"), asyncHandler(async (_req, res) => {
  res.json(await listRoomServiceMenu());
}));

guestServicesRouter.get("/runners", authorize("GuestServices", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listServiceRunners() });
}));

guestServicesRouter.get("/overdue-alerts", authorize("GuestServices", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: isServiceManager(_req.user!.roleName) ? await listOverdueHighPriorityConciergeRequests() : [] });
}));

guestServicesRouter.put("/reservations/:id/cash-only", authorize("GuestServices", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ cashOnly: z.boolean() }), req);
  res.json(await setReservationCashOnlyForRole(paramId(req.params.id), body.cashOnly, req.user!.id, req.user!.roleName, getClientIp(req)));
}));

guestServicesRouter.get("/active-requests", authorize("GuestServices", "VIEW"), asyncHandler(async (req, res) => {
  res.json({ items: await listActiveRequests(isServiceManager(req.user!.roleName) ? undefined : req.user!.id) });
}));

guestServicesRouter.get("/my-queue", authorize("GuestServices", "VIEW"), asyncHandler(async (req, res) => {
  res.json({ items: await listActiveRequests(req.user!.id) });
}));

guestServicesRouter.post("/orders", authorize("GuestServices", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    reservationId: z.string(),
    serviceType: z.enum(["LAUNDRY", "ROOM_SERVICE", "TRANSIT", "CONCIERGE", "OTHERS"]),
    priority: z.nativeEnum(GuestServicePriority).optional(),
    catalogItemId: z.string().optional(),
    totalCharge: z.number().optional(),
    specialInstructions: z.string().optional(),
    laundryItems: z.array(z.object({
      itemName: z.string(),
      quantity: z.number().int().min(1),
      unitPrice: z.number().min(0),
      serviceOption: z.enum(["WASH_AND_FOLD", "IRON", "DRY_CLEAN"]).optional(),
    })).optional(),
    posItems: z.array(z.object({ menuItemId: z.string(), quantity: z.number().int().min(1) })).optional(),
  }), req);
  res.status(201).json(await createServiceOrder({ ...body, userId: req.user!.id, ipAddress: getClientIp(req) }));
}));

guestServicesRouter.put("/orders/:id/assign", authorize("GuestServices", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ runnerUserId: z.string() }), req);
  res.json(await assignRunner(paramId(req.params.id), body.runnerUserId, req.user!.id, req.user!.roleName, getClientIp(req)));
}));

guestServicesRouter.put("/orders/:id/status", authorize("GuestServices", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    status: z.nativeEnum(GuestServiceStatus),
  }), req);
  res.json(await updateServiceStatus(paramId(req.params.id), body.status, req.user!.id, req.user!.roleName, getClientIp(req)));
}));

guestServicesRouter.post("/transit/schedule", authorize("GuestServices", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    reservationId: z.string(),
    passengerName: z.string(),
    transitType: z.enum(["AIRPORT_PICKUP", "SHUTTLE_DROP", "TOURS"]),
    scheduledTime: z.string(),
    vehiclePlateNumber: z.string().optional(),
    driverUserId: z.string().optional(),
    totalCharge: z.number().optional(),
    priority: z.nativeEnum(GuestServicePriority).optional(),
  }), req);
  res.status(201).json(await scheduleTransit({ ...body, userId: req.user!.id, ipAddress: getClientIp(req) }));
}));
