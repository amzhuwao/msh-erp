import { Router } from "express";
import { z } from "zod";
import { asyncHandler, getClientIp, validateBody, validateQuery } from "../middleware/http.js";
import { searchAvailability } from "../services/reservation.service.js";
import { createOnlineBooking, publicProperty } from "../services/public-booking.service.js";

export const publicRouter = Router();

publicRouter.get("/property", asyncHandler(async (_req, res) => {
  res.json(await publicProperty());
}));

publicRouter.get("/availability", asyncHandler(async (req, res) => {
  const q = validateQuery(z.object({
    checkIn: z.string(),
    checkOut: z.string(),
    adults: z.coerce.number().int().min(1).default(1),
  }), req);
  const results = await searchAvailability(new Date(q.checkIn), new Date(q.checkOut), q.adults);
  res.json({ results });
}));

publicRouter.post("/bookings", asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    nationality: z.string().min(2),
    nationalId: z.string().optional(),
    passportNumber: z.string().optional(),
    checkInDate: z.string(),
    checkOutDate: z.string(),
    adults: z.number().int().min(1).default(1),
    children: z.number().int().min(0).optional(),
    ratePlanId: z.string(),
    specialRequests: z.string().optional(),
  }).superRefine((data, ctx) => {
    if (!data.nationalId?.trim() && !data.passportNumber?.trim()) {
      ctx.addIssue({ code: "custom", message: "National ID or passport is required", path: ["nationalId"] });
    }
  }), req);

  const result = await createOnlineBooking({ ...body, ipAddress: getClientIp(req) });
  res.status(201).json(result);
}));
