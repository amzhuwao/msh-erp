import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, getClientIp, validateBody, validateQuery } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import {
  createContract,
  chargeToCorporate,
  createCorporateProfile,
  emailMonthlyCorporateStatements,
  getStatement,
  getCorporateStatementCsv,
  listCorporateProfiles,
  listCorporateRoomTypes,
  postCorporatePayment,
  setCorporateProfileActive,
  updateCorporateBillingRouting,
  updateCreditLimit,
} from "../services/corporate.service.js";

export const corporateRouter = Router();
corporateRouter.use(authenticate);

corporateRouter.get(
  "/profiles",
  authorize("Corporate", "VIEW"),
  asyncHandler(async (_req, res) => {
    res.json({ items: await listCorporateProfiles() });
  }),
);

corporateRouter.get("/room-types", authorize("Corporate", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listCorporateRoomTypes() });
}));

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
      }),
      req,
    );
    const profile = await createCorporateProfile({ ...body, userId: req.user!.id });
    res.status(201).json(profile);
  }),
);

corporateRouter.put(
  "/profiles/:id/status",
  authorize("Corporate", "APPROVE"),
  asyncHandler(async (req, res) => {
    const body = validateBody(z.object({ isActive: z.boolean() }), req);
    res.json(await setCorporateProfileActive(paramId(req.params.id), body.isActive, req.user!.id));
  }),
);

corporateRouter.put("/profiles/:id/billing-routing", authorize("Corporate", "APPROVE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ departments: z.array(z.enum(["ROOMS", "RESTAURANT", "BAR", "SERVICES", "OTHER"])).min(1) }), req);
  res.json(await updateCorporateBillingRouting(paramId(req.params.id), body.departments, req.user!.id));
}));

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

corporateRouter.get("/profiles/:id/statement/export", authorize("Corporate", "VIEW"), asyncHandler(async (req, res) => {
  const query = validateQuery(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() }), req);
  res.json(await getCorporateStatementCsv(paramId(req.params.id), query.month));
}));

corporateRouter.post("/statements/email", authorize("Corporate", "APPROVE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }), req);
  res.json(await emailMonthlyCorporateStatements(body.month, req.user!.id, getClientIp(req)));
}));

corporateRouter.post(
  "/payments",
  authorize("Corporate", "APPROVE"),
  asyncHandler(async (req, res) => {
    const body = validateBody(z.object({
      companyId: z.string(),
      amount: z.number().positive(),
      referenceDetails: z.string().optional(),
    }), req);
    res.status(201).json(await postCorporatePayment({ ...body, userId: req.user!.id, ipAddress: getClientIp(req) }));
  }),
);

const chargeSchema = z.object({ companyId: z.string(), amount: z.number().positive(), referenceDetails: z.string().min(1) });

corporateRouter.post("/charges", authorize("Corporate", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(chargeSchema, req);
  res.status(201).json(await chargeToCorporate({ ...body, userId: req.user!.id, ipAddress: getClientIp(req) }));
}));

corporateRouter.post("/charges/override", authorize("Corporate", "APPROVE"), asyncHandler(async (req, res) => {
  const body = validateBody(chargeSchema, req);
  res.status(201).json(await chargeToCorporate({ ...body, override: true, userId: req.user!.id, ipAddress: getClientIp(req) }));
}));
