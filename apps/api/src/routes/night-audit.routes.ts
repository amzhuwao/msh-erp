import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, getClientIp } from "../middleware/http.js";
import { runNightAudit } from "../services/folio.service.js";

export const nightAuditRouter = Router();

nightAuditRouter.use(authenticate);

nightAuditRouter.post(
  "/run",
  authorize("Reservations", "OVERRIDE"),
  asyncHandler(async (req, res) => {
    const result = await runNightAudit(req.user!.id, getClientIp(req));
    res.json(result);
  }),
);
