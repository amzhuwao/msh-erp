import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, getClientIp, validateBody, validateQuery } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import {
  addGroupGuest,
  allocateGroupRoom,
  checkGroupAvailability,
  confirmGroupReservation,
  createGroupReservation,
  getGroupDashboard,
  getGroupFolio,
  getGroupReservation,
  importRoomingList,
  listGroupReservations,
} from "../services/group-reservation.service.js";

export const groupReservationsRouter = Router();

groupReservationsRouter.use(authenticate);

const createSchema = z.object({
  groupName: z.string().min(1),
  companyId: z.string().optional(),
  contactPerson: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email(),
  arrivalDate: z.string(),
  departureDate: z.string(),
  adults: z.number().int().min(1).default(1),
  children: z.number().int().min(0).default(0),
  roomCount: z.number().int().min(1),
  specialRequests: z.string().optional(),
  depositAmount: z.number().min(0).optional(),
});

groupReservationsRouter.get(
  "/dashboard",
  authorize("GroupReservations", "VIEW"),
  asyncHandler(async (_req, res) => {
    res.json(await getGroupDashboard());
  }),
);

groupReservationsRouter.get(
  "/availability",
  authorize("GroupReservations", "VIEW"),
  asyncHandler(async (req, res) => {
    const query = validateQuery(
      z.object({
        arrivalDate: z.string(),
        departureDate: z.string(),
        roomCount: z.coerce.number().int().min(1),
      }),
      req,
    );
    res.json(
      await checkGroupAvailability(query.arrivalDate, query.departureDate, query.roomCount),
    );
  }),
);

groupReservationsRouter.get(
  "/",
  authorize("GroupReservations", "VIEW"),
  asyncHandler(async (req, res) => {
    const query = validateQuery(z.object({ status: z.string().optional() }), req);
    const items = await listGroupReservations(query.status);
    res.json({ items });
  }),
);

groupReservationsRouter.get(
  "/:id",
  authorize("GroupReservations", "VIEW"),
  asyncHandler(async (req, res) => {
    res.json(await getGroupReservation(paramId(req.params.id)));
  }),
);

groupReservationsRouter.get(
  "/:id/folio",
  authorize("GroupReservations", "VIEW"),
  asyncHandler(async (req, res) => {
    res.json(await getGroupFolio(paramId(req.params.id)));
  }),
);

groupReservationsRouter.post(
  "/",
  authorize("GroupReservations", "CREATE"),
  asyncHandler(async (req, res) => {
    const body = validateBody(createSchema, req);
    const group = await createGroupReservation({
      ...body,
      createdById: req.user!.id,
      ipAddress: getClientIp(req),
    });
    res.status(201).json(group);
  }),
);

groupReservationsRouter.post(
  "/:id/confirm",
  authorize("GroupReservations", "EDIT"),
  asyncHandler(async (req, res) => {
    const group = await confirmGroupReservation({
      groupId: paramId(req.params.id),
      userId: req.user!.id,
      ipAddress: getClientIp(req),
    });
    res.json(group);
  }),
);

groupReservationsRouter.post(
  "/:id/guests",
  authorize("GroupReservations", "EDIT"),
  asyncHandler(async (req, res) => {
    const body = validateBody(
      z.object({
        fullName: z.string().min(1),
        nationality: z.string().optional(),
        nationalId: z.string().optional(),
        passportNumber: z.string().optional(),
        roomTypeCode: z.string().optional(),
        vipStatus: z.enum(["NONE", "VIP1", "VIP2", "VIP3"]).optional(),
        notes: z.string().optional(),
      }),
      req,
    );
    const guest = await addGroupGuest({
      groupId: paramId(req.params.id),
      ...body,
      userId: req.user!.id,
    });
    res.status(201).json(guest);
  }),
);

groupReservationsRouter.post(
  "/:id/allocate-room",
  authorize("GroupReservations", "EDIT"),
  asyncHandler(async (req, res) => {
    const body = validateBody(
      z.object({
        roomId: z.string(),
        rate: z.number().positive(),
        assignedGuestName: z.string().optional(),
      }),
      req,
    );
    const allocation = await allocateGroupRoom({
      groupId: paramId(req.params.id),
      ...body,
      userId: req.user!.id,
      ipAddress: getClientIp(req),
    });
    res.status(201).json(allocation);
  }),
);

groupReservationsRouter.post(
  "/:id/import-rooming-list",
  authorize("GroupReservations", "EDIT"),
  asyncHandler(async (req, res) => {
    const body = validateBody(
      z.object({
        rows: z.array(
          z.object({
            fullName: z.string(),
            nationality: z.string().optional(),
            nationalId: z.string().optional(),
            passportNumber: z.string().optional(),
            roomTypeCode: z.string().optional(),
            vipStatus: z.string().optional(),
            notes: z.string().optional(),
          }),
        ),
      }),
      req,
    );
    const result = await importRoomingList({
      groupId: paramId(req.params.id),
      rows: body.rows,
      userId: req.user!.id,
      ipAddress: getClientIp(req),
    });
    res.json(result);
  }),
);
