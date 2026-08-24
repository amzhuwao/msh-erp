import { Router } from "express";
import { z } from "zod";
import { asyncHandler, getClientIp, validateBody } from "../middleware/http.js";
import { authenticateGuest } from "../middleware/guest-auth.js";
import {
  getGuestBilling,
  getGuestBooking,
  getGuestProfile,
  loginGuest,
  placeGuestBooking,
  signupGuest,
  updateGuestPassword,
  updateGuestProfile,
  listGuestBookings,
} from "../services/guest-portal.service.js";

export const guestRouter = Router();

guestRouter.post("/signup", asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    fullName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
  }), req);
  res.status(201).json(await signupGuest(body));
}));

guestRouter.post("/login", asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }), req);
  res.json(await loginGuest(body));
}));

guestRouter.get("/me", authenticateGuest, asyncHandler(async (req, res) => {
  res.json({ guest: await getGuestProfile(req.guest!.id) });
}));

guestRouter.patch("/me", authenticateGuest, asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    phone: z.string().optional(),
    nationality: z.string().optional(),
    gender: z.string().optional(),
    companyName: z.string().optional(),
    address: z.string().optional(),
    carRegistration: z.string().optional(),
    nextOfKin: z.string().optional(),
    idPassport: z.string().optional(),
  }), req);
  res.json({ guest: await updateGuestProfile(req.guest!.id, body) });
}));

guestRouter.patch("/password", authenticateGuest, asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
  }), req);
  res.json(await updateGuestPassword(req.guest!.id, body));
}));

guestRouter.get("/bookings", authenticateGuest, asyncHandler(async (req, res) => {
  res.json({ bookings: await listGuestBookings(req.guest!.id) });
}));

guestRouter.get("/bookings/:id", authenticateGuest, asyncHandler(async (req, res) => {
  res.json({ booking: await getGuestBooking(req.guest!.id, String(req.params.id)) });
}));

guestRouter.get("/billing", authenticateGuest, asyncHandler(async (req, res) => {
  res.json(await getGuestBilling(req.guest!.id));
}));

const bookingSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  nationality: z.string().min(2).optional(),
  nationalId: z.string().optional(),
  passportNumber: z.string().optional(),
  idPassport: z.string().optional(),
  gender: z.string().optional(),
  companyName: z.string().optional(),
  address: z.string().optional(),
  checkInDate: z.string(),
  checkOutDate: z.string(),
  adults: z.number().int().min(1).default(1),
  children: z.number().int().min(0).optional(),
  ratePlanId: z.string(),
  specialRequests: z.string().optional(),
  paymentMethod: z.enum(["pay_on_arrival", "bank_transfer"]).optional(),
});

guestRouter.post("/bookings", authenticateGuest, asyncHandler(async (req, res) => {
  const body = validateBody(bookingSchema, req);
  const result = await placeGuestBooking(req.guest!.id, { ...body, ipAddress: getClientIp(req) });
  res.status(201).json(result);
}));
