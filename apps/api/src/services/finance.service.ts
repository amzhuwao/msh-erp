import { AccountType, AccountingPeriodStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { nextDocumentNumber, writeAuditLog } from "./system.service.js";

const ACCOUNT_CODES = {
  GUEST_LEDGER: "1200",
  CASH: "1100",
  VAT_OUTPUT: "2200",
  ROOM_REVENUE: "4100",
  FB_REVENUE: "4200",
} as const;

async function assertPeriodOpen(date: Date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const period = await prisma.accountingPeriod.findUnique({
    where: { year_month: { year, month } },
  });
  if (period?.status === AccountingPeriodStatus.CLOSED) {
    throw new AppError(400, "FIN-001", "Accounting period is closed");
  }
}

async function getAccountByCode(code: string) {
  const account = await prisma.chartOfAccount.findUnique({ where: { accountCode: code } });
  if (!account || !account.isActive) {
    throw new AppError(404, "FIN-002", `Account ${code} not found`);
  }
  return account;
}

export async function listChartOfAccounts() {
  return prisma.chartOfAccount.findMany({
    where: { isActive: true },
    orderBy: { accountCode: "asc" },
  });
}

export async function createJournalEntry(input: {
  transactionDate: string;
  description: string;
  referenceDocument?: string;
  lines: { accountCode: string; debitAmount?: number; creditAmount?: number }[];
  userId: string;
  ipAddress?: string;
}) {
  const txDate = new Date(input.transactionDate);
  await assertPeriodOpen(txDate);

  if (input.lines.length < 2) {
    throw new AppError(400, "FIN-003", "Journal entry requires at least two lines");
  }

  let totalDebit = 0;
  let totalCredit = 0;
  const resolvedLines: { accountId: string; debitAmount: number; creditAmount: number }[] = [];

  for (const line of input.lines) {
    const debit = line.debitAmount ?? 0;
    const credit = line.creditAmount ?? 0;
    if (debit < 0 || credit < 0 || (debit === 0 && credit === 0) || (debit > 0 && credit > 0)) {
      throw new AppError(400, "FIN-004", "Each line must have either a debit or credit amount");
    }
    const account = await getAccountByCode(line.accountCode);
    resolvedLines.push({ accountId: account.id, debitAmount: debit, creditAmount: credit });
    totalDebit += debit;
    totalCredit += credit;
  }

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new AppError(400, "FIN-005", "Debits and credits must balance");
  }

  const entryNumber = await nextDocumentNumber("GL_ENTRIES");

  const entry = await prisma.$transaction(async (tx) => {
    const created = await tx.generalLedgerEntry.create({
      data: {
        entryNumber,
        transactionDate: txDate,
        referenceDocument: input.referenceDocument,
        description: input.description,
        createdById: input.userId,
        lines: {
          create: resolvedLines,
        },
      },
      include: { lines: { include: { account: true } } },
    });

    for (const line of resolvedLines) {
      const delta = line.debitAmount - line.creditAmount;
      await tx.chartOfAccount.update({
        where: { id: line.accountId },
        data: { currentBalance: { increment: delta } },
      });
    }

    return created;
  });

  await writeAuditLog({
    userId: input.userId,
    module: "Finance",
    action: "JOURNAL_POSTED",
    entityType: "GeneralLedgerEntry",
    entityId: entry.id,
    details: { entryNumber, totalDebit },
    ipAddress: input.ipAddress,
  });

  return entry;
}

export async function postRoomChargeToLedger(input: {
  amount: number;
  taxAmount: number;
  netAmount: number;
  referenceDocument: string;
  userId: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  return createJournalEntry({
    transactionDate: today,
    description: `Room charge posting — ${input.referenceDocument}`,
    referenceDocument: input.referenceDocument,
    lines: [
      { accountCode: ACCOUNT_CODES.GUEST_LEDGER, debitAmount: input.amount },
      { accountCode: ACCOUNT_CODES.FB_REVENUE, creditAmount: input.netAmount },
      ...(input.taxAmount > 0
        ? [{ accountCode: ACCOUNT_CODES.VAT_OUTPUT, creditAmount: input.taxAmount }]
        : []),
    ],
    userId: input.userId,
  });
}

export async function postPosCashSale(input: {
  totalAmount: number;
  taxAmount: number;
  netAmount: number;
  referenceDocument: string;
  userId: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  return createJournalEntry({
    transactionDate: today,
    description: `POS cash sale — ${input.referenceDocument}`,
    referenceDocument: input.referenceDocument,
    lines: [
      { accountCode: ACCOUNT_CODES.CASH, debitAmount: input.totalAmount },
      { accountCode: ACCOUNT_CODES.FB_REVENUE, creditAmount: input.netAmount },
      ...(input.taxAmount > 0
        ? [{ accountCode: ACCOUNT_CODES.VAT_OUTPUT, creditAmount: input.taxAmount }]
        : []),
    ],
    userId: input.userId,
  });
}

export async function getTrialBalance() {
  const accounts = await prisma.chartOfAccount.findMany({
    where: { isActive: true },
    orderBy: { accountCode: "asc" },
  });

  return {
    asOf: new Date().toISOString().slice(0, 10),
    accounts: accounts.map((a) => ({
      accountCode: a.accountCode,
      accountName: a.accountName,
      accountType: a.accountType,
      balance: Number(a.currentBalance),
    })),
    totalDebits: accounts
      .filter((a) => Number(a.currentBalance) > 0)
      .reduce((s, a) => s + Number(a.currentBalance), 0),
    totalCredits: accounts
      .filter((a) => Number(a.currentBalance) < 0)
      .reduce((s, a) => s + Math.abs(Number(a.currentBalance)), 0),
  };
}

export async function getProfitAndLoss(fromDate?: string, toDate?: string) {
  const from = fromDate ? new Date(fromDate) : new Date(new Date().getFullYear(), 0, 1);
  const to = toDate ? new Date(toDate) : new Date();

  const lines = await prisma.generalLedgerLine.findMany({
    where: {
      glEntry: {
        transactionDate: { gte: from, lte: to },
      },
      account: {
        accountType: { in: [AccountType.REVENUE, AccountType.EXPENSE] },
      },
    },
    include: { account: true, glEntry: true },
  });

  const byAccount = new Map<string, { code: string; name: string; type: AccountType; net: number }>();

  for (const line of lines) {
    const key = line.accountId;
    const existing = byAccount.get(key) ?? {
      code: line.account.accountCode,
      name: line.account.accountName,
      type: line.account.accountType,
      net: 0,
    };
    existing.net += Number(line.creditAmount) - Number(line.debitAmount);
    byAccount.set(key, existing);
  }

  const revenue = [...byAccount.values()].filter((a) => a.type === AccountType.REVENUE);
  const expenses = [...byAccount.values()].filter((a) => a.type === AccountType.EXPENSE);
  const totalRevenue = revenue.reduce((s, a) => s + a.net, 0);
  const totalExpenses = expenses.reduce((s, a) => s + Math.abs(a.net), 0);

  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
    revenue,
    expenses,
    totalRevenue,
    totalExpenses,
    netIncome: totalRevenue - totalExpenses,
  };
}

export async function listJournalEntries(limit = 50) {
  return prisma.generalLedgerEntry.findMany({
    include: { lines: { include: { account: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function closeAccountingPeriod(input: {
  year: number;
  month: number;
  userId: string;
  ipAddress?: string;
}) {
  const period = await prisma.accountingPeriod.upsert({
    where: { year_month: { year: input.year, month: input.month } },
    create: {
      year: input.year,
      month: input.month,
      status: AccountingPeriodStatus.CLOSED,
      closedAt: new Date(),
      closedById: input.userId,
    },
    update: {
      status: AccountingPeriodStatus.CLOSED,
      closedAt: new Date(),
      closedById: input.userId,
    },
  });

  await writeAuditLog({
    userId: input.userId,
    module: "Finance",
    action: "PERIOD_CLOSED",
    entityType: "AccountingPeriod",
    entityId: period.id,
    details: { year: input.year, month: input.month },
    ipAddress: input.ipAddress,
  });

  return period;
}
