import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, validateBody, validateQuery } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import {
  allocateResource,
  checkVenueAvailability,
  completeBooking,
  confirmBooking,
  createBooking,
  createVenue,
  deleteVenue,
  getVenue,
  kitchenSummary,
  listBookings,
  listInHouseReservations,
  listPackages,
  listResources,
  listVenues,
  updateVenue,
} from "../services/conference.service.js";

export const conferenceRouter = Router();
conferenceRouter.use(authenticate);

conferenceRouter.get("/venues", authorize("Conference", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listVenues() });
}));

const venueBodySchema = z.object({
  name: z.string().trim().min(1),
  locationDescription: z.string().nullable().optional(),
  maxCapacityBanquet: z.number().int().min(1),
  maxCapacityCinema: z.number().int().min(1),
  maxCapacityBoardroom: z.number().int().min(1),
  halfDayRate: z.number().finite().min(0),
  fullDayRate: z.number().finite().min(0),
});

conferenceRouter.get("/venues/:id", authorize("Conference", "VIEW"), asyncHandler(async (req, res) => {
  res.json(await getVenue(paramId(req.params.id)));
}));

conferenceRouter.post("/venues", authorize("Conference", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(venueBodySchema, req);
  res.status(201).json(await createVenue({ ...body, userId: req.user!.id }));
}));

conferenceRouter.put("/venues/:id", authorize("Conference", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(venueBodySchema.partial().extend({ isActive: z.boolean().optional() }), req);
  res.json(await updateVenue(paramId(req.params.id), { ...body, userId: req.user!.id }));
}));

conferenceRouter.delete("/venues/:id", authorize("Conference", "DELETE"), asyncHandler(async (req, res) => {
  res.json(await deleteVenue(paramId(req.params.id), req.user!.id));
}));

conferenceRouter.get("/packages", authorize("Conference", "VIEW"), asyncHandler(async (req, res) => {
  const query = validateQuery(z.object({ venueId: z.string().min(1) }), req);
  res.json({ items: await listPackages(query.venueId) });
}));

conferenceRouter.get("/resources", authorize("Conference", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listResources() });
}));

conferenceRouter.get("/bookings", authorize("Conference", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listBookings() });
}));

conferenceRouter.get("/in-house-reservations", authorize("Conference", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listInHouseReservations() });
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
    customVenueRate: z.number().finite().min(0).optional(),
    packageId: z.string().optional(),
    groupReservationId: z.string().optional(),
    reservationId: z.string().optional(),
    companyId: z.string().optional(),
    depositRequired: z.number().min(0).optional(),
  }), req);
  res.status(201).json(await createBooking({ ...body, userId: req.user!.id }));
}));

conferenceRouter.post("/bookings/:id/complete", authorize("Conference", "EDIT"), asyncHandler(async (req, res) => {
  res.json(await completeBooking(paramId(req.params.id), req.user!.id, req.ip));
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
