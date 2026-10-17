import { CorporateCreditType, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { nextDocumentNumber, writeAuditLog } from "./system.service.js";
import { utcToday } from "../lib/tax.js";

export async function listCorporateProfiles() {
  return prisma.corporateProfile.findMany({
    include: { _count: { select: { contracts: true, creditTransactions: true } } },
    orderBy: { companyName: "asc" },
  });
}

export async function listCorporateRoomTypes() {
  return prisma.roomType.findMany({ select: { id: true, code: true, name: true, baseRate: true }, orderBy: { name: "asc" } });
}

export async function createCorporateProfile(input: {
  companyName: string;
  registrationNumber?: string;
  contactName: string;
  contactEmail: string;
  phone?: string;
  creditLimit: number;
  paymentTermsDays: number;
  userId: string;
}) {
  const profile = await prisma.corporateProfile.create({
    data: {
      companyName: input.companyName.trim(),
      registrationNumber: input.registrationNumber?.trim() || undefined,
      contactName: input.contactName.trim(),
      contactEmail: input.contactEmail.trim().toLowerCase(),
      phone: input.phone?.trim() || undefined,
      creditLimit: input.creditLimit,
      paymentTermsDays: input.paymentTermsDays,
      isCreditApproved: false,
    },
  });
  await writeAuditLog({
    userId: input.userId,
    module: "Corporate",
    action: "CORPORATE_PROFILE_CREATED",
    entityType: "CorporateProfile",
    entityId: profile.id,
    details: { companyName: profile.companyName },
  });
  return profile;
}

export async function setCorporateProfileActive(id: string, isActive: boolean, userId: string) {
  const current = await prisma.corporateProfile.findUnique({ where: { id } });
  if (!current) throw new AppError(404, "COR-001", "Corporate profile not found");
  const updated = await prisma.corporateProfile.update({ where: { id }, data: { isActive } });
  await writeAuditLog({ userId, module: "Corporate", action: "CORPORATE_PROFILE_STATUS", entityType: "CorporateProfile", entityId: id, details: { oldValue: current.isActive, newValue: isActive } });
  return updated;
}

export async function updateCorporateBillingRouting(id: string, departments: string[], userId: string) {
  const current = await prisma.corporateProfile.findUnique({ where: { id } });
  if (!current) throw new AppError(404, "COR-001", "Corporate profile not found");
  const updated = await prisma.corporateProfile.update({ where: { id }, data: { corporatePaidDepartments: [...new Set(departments)] } });
  await writeAuditLog({ userId, module: "Corporate", action: "CORPORATE_BILLING_ROUTING_CHANGED", entityType: "CorporateProfile", entityId: id, details: { oldDepartments: current.corporatePaidDepartments, newDepartments: updated.corporatePaidDepartments } });
  return updated;
}

export async function getCorporateProfile(id: string) {
  const profile = await prisma.corporateProfile.findUnique({
    where: { id },
    include: {
      contracts: { include: { roomType: true } },
      invoices: { orderBy: { issueDate: "desc" } },
      creditTransactions: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!profile) throw new AppError(404, "COR-001", "Corporate profile not found");
  return profile;
}

export async function updateCreditLimit(id: string, creditLimit: number, userId: string) {
  const current = await prisma.corporateProfile.findUnique({ where: { id } });
  if (!current) throw new AppError(404, "COR-001", "Corporate profile not found");
  if (creditLimit < Number(current.currentOutstanding)) {
    throw new AppError(400, "COR-005", "Credit limit cannot be lower than current outstanding", { currentOutstanding: Number(current.currentOutstanding) });
  }
  const updated = await prisma.corporateProfile.update({
    where: { id },
    data: { creditLimit, isCreditApproved: true },
  });
  await writeAuditLog({
    userId,
    module: "Corporate",
    action: "CREDIT_LIMIT_APPROVED",
    entityType: "CorporateProfile",
    entityId: id,
    details: { oldLimit: Number(current.creditLimit), newLimit: creditLimit },
  });
  return updated;
}

export async function createContract(input: {
  companyId: string;
  roomTypeId: string;
  contractedRate: number;
  startDate: string;
  endDate: string;
  userId: string;
}) {
  const company = await prisma.corporateProfile.findUnique({ where: { id: input.companyId } });
  if (!company) throw new AppError(404, "COR-001", "Corporate profile not found");
  if (!company.isActive) throw new AppError(400, "COR-002", "Company is inactive");
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  if (startDate >= endDate) throw new AppError(400, "COR-006", "Contract start date must be before end date");
  const roomType = await prisma.roomType.findUnique({ where: { id: input.roomTypeId } });
  if (!roomType) throw new AppError(404, "COR-009", "Room type not found");
  const overlap = await prisma.negotiatedRateContract.findFirst({
    where: {
      companyId: company.id,
      roomTypeId: roomType.id,
      isActive: true,
      startDate: { lt: endDate },
      endDate: { gt: startDate },
    },
  });
  if (overlap) throw new AppError(409, "COR-007", "An active rate contract already covers part of these dates");
  const contract = await prisma.negotiatedRateContract.create({
    data: {
      companyId: input.companyId,
      roomTypeId: input.roomTypeId,
      contractedRate: input.contractedRate,
      startDate,
      endDate,
    },
    include: { roomType: true, company: true },
  });
  await writeAuditLog({
    userId: input.userId,
    module: "Corporate",
    action: "RATE_CONTRACT_CHANGED",
    entityType: "NegotiatedRateContract",
    entityId: contract.id,
  });
  return contract;
}

export async function postCorporatePayment(input: {
  companyId: string;
  amount: number;
  referenceDetails?: string;
  userId: string;
  ipAddress?: string;
}) {
  const company = await prisma.corporateProfile.findUnique({ where: { id: input.companyId } });
  if (!company) throw new AppError(404, "COR-001", "Corporate profile not found");
  if (!company.isActive) throw new AppError(400, "COR-002", "Company is inactive");
  if (input.amount > Number(company.currentOutstanding) + 0.001) {
    throw new AppError(400, "COR-008", "Payment exceeds current outstanding", { currentOutstanding: Number(company.currentOutstanding) });
  }
  const allocations = await prisma.$transaction(async (db) => {
    const changed = await db.corporateProfile.updateMany({
      where: { id: company.id, isActive: true, currentOutstanding: { gte: input.amount } },
      data: { currentOutstanding: { decrement: input.amount } },
    });
    if (changed.count !== 1) throw new AppError(400, "COR-008", "Payment exceeds current outstanding");
    let remaining = input.amount;
    let runningBalance = Number(company.currentOutstanding);
    const invoices = await db.corporateInvoice.findMany({ where: { companyId: company.id, outstanding: { gt: 0 } }, orderBy: [{ issueDate: "asc" }, { createdAt: "asc" }] });
    const applied: { invoiceId: string | null; amount: number; balanceAfter: number }[] = [];
    for (const invoice of invoices) {
      if (remaining <= 0.001) break;
      const portion = Math.min(remaining, Number(invoice.outstanding));
      const outstanding = Math.max(0, Number(invoice.outstanding) - portion);
      await db.corporateInvoice.update({ where: { id: invoice.id }, data: { outstanding, status: outstanding <= 0.01 ? "PAID" : "PARTIAL" } });
      runningBalance -= portion;
      applied.push({ invoiceId: invoice.id, amount: portion, balanceAfter: runningBalance });
      remaining -= portion;
    }
    if (remaining > 0.001) {
      runningBalance -= remaining;
      applied.push({ invoiceId: null, amount: remaining, balanceAfter: runningBalance });
    }
    const credits = [];
    for (const payment of applied) {
      credits.push(await db.corporateCreditTransaction.create({
        data: {
          companyId: company.id,
          invoiceId: payment.invoiceId,
          transactionType: CorporateCreditType.CREDIT_PAYMENT,
          amount: payment.amount,
          balanceAfter: payment.balanceAfter,
          referenceDetails: input.referenceDetails,
          createdById: input.userId,
        },
      }));
    }
    return credits;
  });
  await writeAuditLog({
    userId: input.userId,
    module: "Corporate",
    action: "PAYMENT_ALLOCATED",
    entityType: "CorporateProfile",
    entityId: company.id,
    details: { amount: input.amount, referenceDetails: input.referenceDetails, invoiceIds: allocations.map((credit) => credit.invoiceId).filter(Boolean) },
    ipAddress: input.ipAddress,
  });
  return allocations;
}

export async function getStatement(id: string) {
  const profile = await getCorporateProfile(id);
  const now = Date.now();
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0 };
  let invoicedOutstanding = 0;
  for (const invoice of profile.invoices) {
    const amount = Number(invoice.outstanding);
    if (amount <= 0.001) continue;
    invoicedOutstanding += amount;
    const daysPastDue = (now - invoice.dueDate.getTime()) / 86400000;
    if (daysPastDue <= 0) buckets.current += amount;
    else if (daysPastDue <= 30) buckets.d30 += amount;
    else if (daysPastDue <= 60) buckets.d60 += amount;
    else buckets.d90 += amount;
  }
  const unlinkedOutstanding = Math.max(0, Number(profile.currentOutstanding) - invoicedOutstanding);
  if (unlinkedOutstanding > 0.001) buckets.current += unlinkedOutstanding;
  return {
    company: profile,
    outstanding: Number(profile.currentOutstanding),
    creditLimit: Number(profile.creditLimit),
    available: Number(profile.creditLimit) - Number(profile.currentOutstanding),
    aging: buckets,
    transactions: profile.creditTransactions,
  };
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function getCorporateStatementCsv(id: string, month?: string) {
  const profile = await getCorporateProfile(id);
  const period = month ?? utcToday().toISOString().slice(0, 7);
  const start = new Date(`${period}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const transactions = profile.creditTransactions;
  const before = transactions.filter((tx) => tx.createdAt < start);
  const current = transactions.filter((tx) => tx.createdAt >= start && tx.createdAt < end);
  const openingBalance = before.length ? Number(before[before.length - 1]!.balanceAfter) : 0;
  const closingBalance = current.length ? Number(current[current.length - 1]!.balanceAfter) : openingBalance;
  const invoiceById = new Map(profile.invoices.map((invoice) => [invoice.id, invoice]));
  const rows: (string | number | null | undefined)[][] = [
    ["Corporate statement", profile.companyName],
    ["Registration number", profile.registrationNumber],
    ["Period", period],
    [],
    ["Date", "Invoice", "Type", "Reference", "Debit", "Credit", "Balance"],
    ["", "", "Opening balance", "", "", "", openingBalance.toFixed(2)],
  ];
  for (const tx of current) {
    const invoice = tx.invoiceId ? invoiceById.get(tx.invoiceId) : undefined;
    const debit = tx.transactionType === "DEBIT_CHARGE" ? Number(tx.amount) : 0;
    const credit = tx.transactionType === "CREDIT_PAYMENT" ? Number(tx.amount) : 0;
    rows.push([
      tx.createdAt.toISOString().slice(0, 10),
      invoice?.invoiceNumber,
      tx.transactionType,
      tx.referenceDetails,
      debit ? debit.toFixed(2) : "",
      credit ? credit.toFixed(2) : "",
      Number(tx.balanceAfter).toFixed(2),
    ]);
  }
  rows.push(["", "", "Closing balance", "", "", "", closingBalance.toFixed(2)]);
  return {
    filename: `${profile.companyName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-${period}-statement.csv`,
    csv: rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
  };
}

export async function emailMonthlyCorporateStatements(month: string, userId: string, ipAddress?: string) {
  const host = process.env.SMTP_HOST;
  if (!host) throw new AppError(503, "COR-010", "SMTP is not configured; set SMTP_HOST before sending statements");
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  const companies = await prisma.corporateProfile.findMany({ where: { isActive: true }, select: { id: true, companyName: true, contactEmail: true } });
  const results: { companyId: string; companyName: string; email: string; sent: boolean; error?: string }[] = [];
  for (const company of companies) {
    try {
      const statement = await getCorporateStatementCsv(company.id, month);
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@manicaskyview.co.zw",
        to: company.contactEmail,
        subject: `Manica Skyview corporate statement — ${month}`,
        text: `Dear ${company.companyName},\n\nPlease find your corporate account statement for ${month} attached.\n\nRegards,\nManica Skyview Hotel`,
        attachments: [{ filename: statement.filename, content: statement.csv, contentType: "text/csv" }],
      });
      await writeAuditLog({ userId, module: "Corporate", action: "CORPORATE_STATEMENT_EMAIL_SENT", entityType: "CorporateProfile", entityId: company.id, details: { month, email: company.contactEmail }, ipAddress });
      results.push({ companyId: company.id, companyName: company.companyName, email: company.contactEmail, sent: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email delivery failed";
      await writeAuditLog({ userId, module: "Corporate", action: "CORPORATE_STATEMENT_EMAIL_FAILED", entityType: "CorporateProfile", entityId: company.id, details: { month, email: company.contactEmail, error: message }, ipAddress });
      results.push({ companyId: company.id, companyName: company.companyName, email: company.contactEmail, sent: false, error: message });
    }
  }
  return { month, total: companies.length, sent: results.filter((result) => result.sent).length, failed: results.filter((result) => !result.sent).length, results };
}

export async function postCorporateInvoiceChargeWithinTransaction(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    amount: number;
    referenceDetails: string;
    userId: string;
    invoiceNumber: string;
    reservationId?: string;
    override?: boolean;
  },
) {
  const company = await tx.corporateProfile.findUnique({ where: { id: input.companyId } });
  if (!company?.isActive) throw new AppError(400, "COR-002", "Company is inactive");
  if (!company.isCreditApproved) throw new AppError(400, "COR-003", "Credit not approved");
  const creditLimit = Number(company.creditLimit);
  const changed = await tx.corporateProfile.updateMany({
    where: {
      id: company.id,
      isActive: true,
      isCreditApproved: true,
      ...(input.override ? {} : { currentOutstanding: { lte: creditLimit - input.amount } }),
    },
    data: { currentOutstanding: { increment: input.amount } },
  });
  if (changed.count !== 1) throw new AppError(400, "COR-004", "Charge would exceed credit limit", { creditLimit });
  const updated = await tx.corporateProfile.findUniqueOrThrow({ where: { id: company.id } });
  const issueDate = utcToday();
  const dueDate = new Date(issueDate);
  dueDate.setUTCDate(dueDate.getUTCDate() + company.paymentTermsDays);
  const invoice = await tx.corporateInvoice.create({
    data: {
      invoiceNumber: input.invoiceNumber,
      companyId: company.id,
      reservationId: input.reservationId,
      amount: input.amount,
      outstanding: input.amount,
      issueDate,
      dueDate: new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate())),
      referenceDetails: input.referenceDetails,
    },
  });
  const transaction = await tx.corporateCreditTransaction.create({
    data: {
      companyId: company.id,
      invoiceId: invoice.id,
      transactionType: CorporateCreditType.DEBIT_CHARGE,
      amount: input.amount,
      balanceAfter: Number(updated.currentOutstanding),
      referenceDetails: input.referenceDetails,
      createdById: input.userId,
    },
  });
  return { invoice, transaction };
}

export async function chargeToCorporate(input: {
  companyId: string;
  amount: number;
  referenceDetails: string;
  userId: string;
  override?: boolean;
  ipAddress?: string;
}) {
  const company = await prisma.corporateProfile.findUnique({ where: { id: input.companyId } });
  if (!company?.isActive) throw new AppError(400, "COR-002", "Company is inactive");
  if (!company.isCreditApproved) throw new AppError(400, "COR-003", "Credit not approved");
  const invoiceNumber = `COR-${await nextDocumentNumber("INVOICES")}`;
  const charge = await prisma.$transaction(async (db) => postCorporateInvoiceChargeWithinTransaction(db, {
    companyId: input.companyId,
    amount: input.amount,
    referenceDetails: input.referenceDetails,
    userId: input.userId,
    invoiceNumber,
    override: input.override,
  }));
  await writeAuditLog({
    userId: input.userId,
    module: "Corporate",
    action: input.override && Number(charge.transaction.balanceAfter) > Number(company.creditLimit) ? "CORPORATE_CREDIT_OVERRIDE" : "CORPORATE_CHARGE_POSTED",
    entityType: "CorporateCreditTransaction",
    entityId: charge.transaction.id,
    details: { amount: input.amount, invoiceNumber: charge.invoice.invoiceNumber, balanceAfter: Number(charge.transaction.balanceAfter), override: Boolean(input.override), referenceDetails: input.referenceDetails },
    ipAddress: input.ipAddress,
  });
  return charge;
}
