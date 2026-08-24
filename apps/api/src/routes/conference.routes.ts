import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, validateBody, validateQuery } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import {
  allocateResource,
  checkVenueAvailability,
  confirmBooking,
  createBooking,
  kitchenSummary,
  listBookings,
  listPackages,
  listResources,
  listVenues,
} from "../services/conference.service.js";

export const conferenceRouter = Router();
conferenceRouter.use(authenticate);

conferenceRouter.get("/venues", authorize("Conference", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listVenues() });
}));

conferenceRouter.get("/packages", authorize("Conference", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listPackages() });
}));

conferenceRouter.get("/resources", authorize("Conference", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listResources() });
}));

conferenceRouter.get("/bookings", authorize("Conference", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listBookings() });
}));

conferenceRouter.get("/availability", authorize("Conference", "VIEW"), asyncHandler(async (req, res) => {
  const q = validateQuery(z.object({ venueId: z.string(), start: z.string(), end: z.string() }), req);
  res.json(await checkVenueAvailability(q.venueId, new Date(q.start), new Date(q.end)));
}));

conferenceRouter.get("/kitchen-summary", authorize("Conference", "VIEW"), asyncHandler(async (req, res) => {
  const q = validateQuery(z.object({ date: z.string() }), req);
  res.json({ items: await kitchenSummary(q.date) });
}));

conferenceRouter.post("/bookings", authorize("Conference", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    venueId: z.string(),
    contactName: z.string().min(1),
    startTimestamp: z.string(),
    endTimestamp: z.string(),
    setupStyle: z.enum(["BANQUET", "BOARDROOM", "USHAPE", "CINEMA"]).optional(),
    estimatedPax: z.number().int().min(1),
    packageId: z.string().optional(),
    groupReservationId: z.string().optional(),
    companyId: z.string().optional(),
    depositRequired: z.number().min(0).optional(),
  }), req);
  res.status(201).json(await createBooking({ ...body, userId: req.user!.id }));
}));

conferenceRouter.put("/bookings/:id/confirm", authorize("Conference", "EDIT"), asyncHandler(async (req, res) => {
  res.json(await confirmBooking(paramId(req.params.id), req.user!.id));
}));

conferenceRouter.post("/bookings/:id/resources", authorize("Conference", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ resourceId: z.string(), quantity: z.number().int().min(1) }), req);
  res.status(201).json(await allocateResource({
    bookingId: paramId(req.params.id),
    resourceId: body.resourceId,
    quantity: body.quantity,
    userId: req.user!.id,
  }));
}));
