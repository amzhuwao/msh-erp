import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, validateBody } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import {
  createContract,
  getStatement,
  listCorporateProfiles,
  postCorporatePayment,
  updateCreditLimit,
} from "../services/corporate.service.js";
import { prisma } from "../lib/prisma.js";

export const corporateRouter = Router();
corporateRouter.use(authenticate);

corporateRouter.get(
  "/profiles",
  authorize("Corporate", "VIEW"),
  asyncHandler(async (_req, res) => {
    res.json({ items: await listCorporateProfiles() });
  }),
);

corporateRouter.post(
  "/profiles",
  authorize("Corporate", "CREATE"),
  asyncHandler(async (req, res) => {
    const body = validateBody(
      z.object({
        companyName: z.string().min(1),
        registrationNumber: z.string().optional(),
        contactName: z.string().min(1),
        contactEmail: z.string().email(),
        phone: z.string().optional(),
        creditLimit: z.number().min(0).default(0),
        paymentTermsDays: z.number().int().default(30),
        isCreditApproved: z.boolean().default(false),
      }),
      req,
    );
    const profile = await prisma.corporateProfile.create({ data: body });
    res.status(201).json(profile);
  }),
);

corporateRouter.put(
  "/profiles/:id/credit-limit",
  authorize("Corporate", "APPROVE"),
  asyncHandler(async (req, res) => {
    const body = validateBody(z.object({ creditLimit: z.number().min(0) }), req);
    res.json(await updateCreditLimit(paramId(req.params.id), body.creditLimit, req.user!.id));
  }),
);

corporateRouter.post(
  "/contracts",
  authorize("Corporate", "CREATE"),
  asyncHandler(async (req, res) => {
    const body = validateBody(z.object({
      companyId: z.string(),
      roomTypeId: z.string(),
      contractedRate: z.number().positive(),
      startDate: z.string(),
      endDate: z.string(),
    }), req);
    res.status(201).json(await createContract({ ...body, userId: req.user!.id }));
  }),
);

corporateRouter.get(
  "/profiles/:id/statement",
  authorize("Corporate", "VIEW"),
  asyncHandler(async (req, res) => {
    res.json(await getStatement(paramId(req.params.id)));
  }),
);

corporateRouter.post(
  "/payments",
  authorize("Corporate", "APPROVE"),
  asyncHandler(async (req, res) => {
    const body = validateBody(z.object({
      companyId: z.string(),
      amount: z.number().positive(),
      referenceDetails: z.string().optional(),
    }), req);
    res.status(201).json(await postCorporatePayment({ ...body, userId: req.user!.id }));
  }),
);
