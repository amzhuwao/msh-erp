import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, validateBody } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import {
  assignRunner,
  createServiceOrder,
  listActiveRequests,
  scheduleTransit,
  updateServiceStatus,
} from "../services/guest-services.service.js";

export const guestServicesRouter = Router();
guestServicesRouter.use(authenticate);

guestServicesRouter.get("/active-requests", authorize("GuestServices", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listActiveRequests() });
}));

guestServicesRouter.post("/orders", authorize("GuestServices", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    reservationId: z.string(),
    serviceType: z.enum(["LAUNDRY", "ROOM_SERVICE", "TRANSIT", "CONCIERGE", "OTHERS"]),
    totalCharge: z.number().optional(),
    specialInstructions: z.string().optional(),
    laundryItems: z.array(z.object({
      itemName: z.string(),
      quantity: z.number().int().min(1),
      unitPrice: z.number().min(0),
      serviceOption: z.enum(["WASH_AND_FOLD", "IRON", "DRY_CLEAN"]).optional(),
    })).optional(),
  }), req);
  res.status(201).json(await createServiceOrder({ ...body, userId: req.user!.id }));
}));

guestServicesRouter.put("/orders/:id/assign", authorize("GuestServices", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ runnerUserId: z.string() }), req);
  res.json(await assignRunner(paramId(req.params.id), body.runnerUserId, req.user!.id));
}));

guestServicesRouter.put("/orders/:id/status", authorize("GuestServices", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    status: z.enum(["RECEIVED", "DISPATCHED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  }), req);
  res.json(await updateServiceStatus(paramId(req.params.id), body.status, req.user!.id));
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
  }), req);
  res.status(201).json(await scheduleTransit({ ...body, userId: req.user!.id }));
}));
