import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, getClientIp, validateBody } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import {
  getFolioWithBalance,
  postFolioCharge,
  postFolioPayment,
} from "../services/folio.service.js";

export const foliosRouter = Router();

foliosRouter.use(authenticate);

const chargeSchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
});

foliosRouter.get(
  "/:id",
  authorize("Reservations", "VIEW"),
  asyncHandler(async (req, res) => {
    const folio = await getFolioWithBalance(paramId(req.params.id));
    res.json(folio);
  }),
);

foliosRouter.post(
  "/:id/charges",
  authorize("Reservations", "EDIT"),
  asyncHandler(async (req, res) => {
    const body = validateBody(chargeSchema, req);
    const line = await postFolioCharge({
      folioId: paramId(req.params.id),
      ...body,
      userId: req.user!.id,
      ipAddress: getClientIp(req),
    });
    res.status(201).json(line);
  }),
);

foliosRouter.post(
  "/:id/payments",
  authorize("Reservations", "EDIT"),
  asyncHandler(async (req, res) => {
    const body = validateBody(chargeSchema, req);
    const line = await postFolioPayment({
      folioId: paramId(req.params.id),
      ...body,
      userId: req.user!.id,
      ipAddress: getClientIp(req),
    });
    res.status(201).json(line);
  }),
);
