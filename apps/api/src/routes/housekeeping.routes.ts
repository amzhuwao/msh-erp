import { Router } from "express";
import { LostAndFoundStatus, RoomStatus, TicketPriority } from "@prisma/client";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, getClientIp, validateBody, validateQuery } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import {
  bulkAssignRooms,
  approveHousekeepingSupplyIssue,
  createLostAndFound,
  generateHousekeepingSupplyIssue,
  getHousekeepingDashboard,
  getHousekeepingSupplyConfiguration,
  listHousekeepingSupplyIssues,
  reportRoomDefect,
  removeHousekeepingSupplyStandard,
  saveHousekeepingSupplyStandard,
  updateLostAndFound,
  updateRoomStatus,
} from "../services/housekeeping.service.js";

export const housekeepingRouter = Router();

housekeepingRouter.use(authenticate);

housekeepingRouter.get(
  "/dashboard",
  authorize("Housekeeping", "VIEW"),
  asyncHandler(async (req, res) => {
    const query = validateQuery(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), req);
    res.json(await getHousekeepingDashboard(query.date));
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
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
      req,
    );
    const result = await bulkAssignRooms({
      ...body,
      userId: req.user!.id,
      roleName: req.user!.roleName,
      ipAddress: getClientIp(req),
    });
    res.status(201).json(result);
  }),
);

housekeepingRouter.post("/rooms/:id/report-defect", authorize("Housekeeping", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ description: z.string().min(3), priority: z.nativeEnum(TicketPriority).optional() }), req);
  res.status(201).json(await reportRoomDefect({ roomId: paramId(req.params.id), ...body, userId: req.user!.id, ipAddress: getClientIp(req) }));
}));

housekeepingRouter.post("/lost-and-found", authorize("Housekeeping", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ itemDescription: z.string().min(2), locationFound: z.string().min(1), dateFound: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), storageLocation: z.string().optional(), notes: z.string().optional() }), req);
  res.status(201).json(await createLostAndFound({ ...body, userId: req.user!.id, ipAddress: getClientIp(req) }));
}));

housekeepingRouter.put("/lost-and-found/:id", authorize("Housekeeping", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ status: z.nativeEnum(LostAndFoundStatus), claimedBy: z.string().optional(), storageLocation: z.string().optional() }), req);
  res.json(await updateLostAndFound({ id: paramId(req.params.id), ...body, userId: req.user!.id, roleName: req.user!.roleName, ipAddress: getClientIp(req) }));
}));

housekeepingRouter.get("/supply-configuration", authorize("Housekeeping", "VIEW"), asyncHandler(async (_req, res) => {
  res.json(await getHousekeepingSupplyConfiguration());
}));

housekeepingRouter.put("/supply-standards", authorize("Housekeeping", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ itemId: z.string(), storeLocationId: z.string(), quantityPerRoom: z.number().positive() }), req);
  res.json(await saveHousekeepingSupplyStandard({ ...body, userId: req.user!.id, roleName: req.user!.roleName, ipAddress: getClientIp(req) }));
}));

housekeepingRouter.delete("/supply-standards/:id", authorize("Housekeeping", "EDIT"), asyncHandler(async (req, res) => {
  res.json(await removeHousekeepingSupplyStandard({ id: paramId(req.params.id), userId: req.user!.id, roleName: req.user!.roleName, ipAddress: getClientIp(req) }));
}));

housekeepingRouter.get("/supply-issues", authorize("Housekeeping", "VIEW"), asyncHandler(async (req, res) => {
  const query = validateQuery(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req);
  res.json({ items: await listHousekeepingSupplyIssues(query.date) });
}));

housekeepingRouter.post("/supply-issues", authorize("Housekeeping", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ attendantUserId: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req);
  res.status(201).json(await generateHousekeepingSupplyIssue({ ...body, userId: req.user!.id, roleName: req.user!.roleName, ipAddress: getClientIp(req) }));
}));

housekeepingRouter.put("/supply-issues/:id/approve", authorize("Inventory", "APPROVE"), asyncHandler(async (req, res) => {
  res.json(await approveHousekeepingSupplyIssue({ id: paramId(req.params.id), userId: req.user!.id, ipAddress: getClientIp(req) }));
}));
