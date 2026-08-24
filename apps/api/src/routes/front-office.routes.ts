import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, validateQuery } from "../middleware/http.js";
import {
  getArrivalsToday,
  getDeparturesToday,
  getInHouseGuests,
  getRecentCheckouts,
  getTapeChart,
} from "../services/front-office.service.js";

export const frontOfficeRouter = Router();

frontOfficeRouter.use(authenticate);

frontOfficeRouter.get(
  "/tape-chart",
  authorize("Reservations", "VIEW"),
  asyncHandler(async (req, res) => {
    const query = validateQuery(
      z.object({
        from: z.string().optional(),
        days: z.coerce.number().int().min(1).max(31).default(14),
      }),
      req,
    );
    const from = query.from ? new Date(query.from) : new Date();
    const data = await getTapeChart(from, query.days);
    res.json(data);
  }),
);

frontOfficeRouter.get(
  "/arrivals",
  authorize("Reservations", "VIEW"),
  asyncHandler(async (_req, res) => {
    res.json({ items: await getArrivalsToday() });
  }),
);

frontOfficeRouter.get(
  "/departures",
  authorize("Reservations", "VIEW"),
  asyncHandler(async (_req, res) => {
    res.json({ items: await getDeparturesToday() });
  }),
);

frontOfficeRouter.get(
  "/in-house",
  authorize("Reservations", "VIEW"),
  asyncHandler(async (req, res) => {
    const query = validateQuery(z.object({ search: z.string().optional() }), req);
    res.json({ items: await getInHouseGuests(query.search) });
  }),
);

frontOfficeRouter.get(
  "/recent-checkouts",
  authorize("Reservations", "VIEW"),
  asyncHandler(async (_req, res) => {
    res.json({ items: await getRecentCheckouts() });
  }),
);
