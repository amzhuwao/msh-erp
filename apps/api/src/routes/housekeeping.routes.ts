import { Router } from "express";
import { RoomStatus } from "@prisma/client";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, getClientIp, validateBody } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import {
  bulkAssignRooms,
  getHousekeepingDashboard,
  updateRoomStatus,
} from "../services/housekeeping.service.js";

export const housekeepingRouter = Router();

housekeepingRouter.use(authenticate);

housekeepingRouter.get(
  "/dashboard",
  authorize("Housekeeping", "VIEW"),
  asyncHandler(async (_req, res) => {
    res.json(await getHousekeepingDashboard());
  }),
);

housekeepingRouter.put(
  "/rooms/:id/status",
  authorize("Housekeeping", "EDIT"),
  asyncHandler(async (req, res) => {
    const body = validateBody(
      z.object({
        status: z.nativeEnum(RoomStatus),
        notes: z.string().optional(),
      }),
      req,
    );
    const room = await updateRoomStatus({
      roomId: paramId(req.params.id),
      status: body.status,
      notes: body.notes,
      userId: req.user!.id,
      roleName: req.user!.roleName,
      ipAddress: getClientIp(req),
    });
    res.json(room);
  }),
);

housekeepingRouter.post(
  "/assign-rooms",
  authorize("Housekeeping", "EDIT"),
  asyncHandler(async (req, res) => {
    const body = validateBody(
      z.object({
        roomIds: z.array(z.string()).min(1),
        attendantUserId: z.string(),
        date: z.string(),
      }),
      req,
    );
    const result = await bulkAssignRooms({
      ...body,
      userId: req.user!.id,
    });
    res.status(201).json(result);
  }),
);
