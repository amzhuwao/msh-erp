import { Router } from "express";
import { z } from "zod";
import { asyncHandler, getClientIp, validateBody, validateQuery } from "../middleware/http.js";
import { searchAvailability } from "../services/reservation.service.js";
import { createOnlineBooking, publicProperty } from "../services/public-booking.service.js";
import { publicRoomCatalog } from "../services/guest-portal.service.js";

export const publicRouter = Router();

publicRouter.get("/property", asyncHandler(async (_req, res) => {
  res.json(await publicProperty());
}));

publicRouter.get("/rooms", asyncHandler(async (_req, res) => {
  res.json(await publicRoomCatalog());
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
    paymentMethod: z.enum(["pay_on_arrival", "bank_transfer"]).optional(),
    gender: z.string().optional(),
    companyName: z.string().optional(),
    address: z.string().optional(),
    idPassport: z.string().optional(),
  }).superRefine((data, ctx) => {
    const id = data.nationalId?.trim() || data.passportNumber?.trim() || data.idPassport?.trim();
    if (!id) {
      ctx.addIssue({ code: "custom", message: "National ID or passport is required", path: ["nationalId"] });
    }
  }), req);

  const idPassport = body.idPassport?.trim();
  const result = await createOnlineBooking({
    ...body,
    nationalId: body.nationalId ?? (idPassport && !/[A-Za-z]/.test(idPassport) ? idPassport : undefined),
    passportNumber: body.passportNumber ?? (idPassport && /[A-Za-z]/.test(idPassport) ? idPassport : idPassport),
    ipAddress: getClientIp(req),
  });
  res.status(201).json(result);
}));
