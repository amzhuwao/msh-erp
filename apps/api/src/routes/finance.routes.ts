import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, getClientIp, validateBody, validateQuery } from "../middleware/http.js";
import {
  closeAccountingPeriod,
  createJournalEntry,
  getProfitAndLoss,
  getTrialBalance,
  listChartOfAccounts,
  listJournalEntries,
} from "../services/finance.service.js";

export const financeRouter = Router();

financeRouter.use(authenticate);

financeRouter.get(
  "/coa",
  authorize("Finance", "VIEW"),
  asyncHandler(async (_req, res) => {
    const items = await listChartOfAccounts();
    res.json({ items });
  }),
);

financeRouter.get(
  "/journals",
  authorize("Finance", "VIEW"),
  asyncHandler(async (req, res) => {
    const query = validateQuery(z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }), req);
    const items = await listJournalEntries(query.limit ?? 50);
    res.json({ items });
  }),
);

financeRouter.post(
  "/journals",
  authorize("Finance", "CREATE"),
  asyncHandler(async (req, res) => {
    const body = validateBody(
      z.object({
        transactionDate: z.string(),
        description: z.string().min(1),
        referenceDocument: z.string().optional(),
        lines: z.array(
          z.object({
            accountCode: z.string(),
            debitAmount: z.number().min(0).optional(),
            creditAmount: z.number().min(0).optional(),
          }),
        ).min(2),
      }),
      req,
    );
    const entry = await createJournalEntry({
      ...body,
      userId: req.user!.id,
      ipAddress: getClientIp(req),
    });
    res.status(201).json(entry);
  }),
);

financeRouter.get(
  "/reports/trial-balance",
  authorize("Finance", "VIEW"),
  asyncHandler(async (_req, res) => {
    res.json(await getTrialBalance());
  }),
);

financeRouter.get(
  "/reports/profit-and-loss",
  authorize("Finance", "VIEW"),
  asyncHandler(async (req, res) => {
    const query = validateQuery(
      z.object({ fromDate: z.string().optional(), toDate: z.string().optional() }),
      req,
    );
    res.json(await getProfitAndLoss(query.fromDate, query.toDate));
  }),
);

financeRouter.post(
  "/periods/close",
  authorize("Finance", "APPROVE"),
  asyncHandler(async (req, res) => {
    const body = validateBody(
      z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }),
      req,
    );
    const period = await closeAccountingPeriod({
      ...body,
      userId: req.user!.id,
      ipAddress: getClientIp(req),
    });
    res.json(period);
  }),
);
