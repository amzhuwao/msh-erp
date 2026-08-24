import { CorporateCreditType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { writeAuditLog } from "./system.service.js";

export async function listCorporateProfiles() {
  return prisma.corporateProfile.findMany({
    include: { _count: { select: { contracts: true, creditTransactions: true } } },
    orderBy: { companyName: "asc" },
  });
}

export async function getCorporateProfile(id: string) {
  const profile = await prisma.corporateProfile.findUnique({
    where: { id },
    include: {
      contracts: { include: { roomType: true } },
      creditTransactions: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!profile) throw new AppError(404, "COR-001", "Corporate profile not found");
  return profile;
}

export async function updateCreditLimit(id: string, creditLimit: number, userId: string) {
  const current = await prisma.corporateProfile.findUnique({ where: { id } });
  if (!current) throw new AppError(404, "COR-001", "Corporate profile not found");
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
  const contract = await prisma.negotiatedRateContract.create({
    data: {
      companyId: input.companyId,
      roomTypeId: input.roomTypeId,
      contractedRate: input.contractedRate,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
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
}) {
  const company = await prisma.corporateProfile.findUnique({ where: { id: input.companyId } });
  if (!company) throw new AppError(404, "COR-001", "Corporate profile not found");
  const newOutstanding = Number(company.currentOutstanding) - input.amount;
  const tx = await prisma.$transaction(async (db) => {
    const updated = await db.corporateProfile.update({
      where: { id: company.id },
      data: { currentOutstanding: newOutstanding },
    });
    const credit = await db.corporateCreditTransaction.create({
      data: {
        companyId: company.id,
        transactionType: CorporateCreditType.CREDIT_PAYMENT,
        amount: input.amount,
        balanceAfter: Number(updated.currentOutstanding),
        referenceDetails: input.referenceDetails,
        createdById: input.userId,
      },
    });
    return credit;
  });
  await writeAuditLog({
    userId: input.userId,
    module: "Corporate",
    action: "PAYMENT_ALLOCATED",
    entityType: "CorporateProfile",
    entityId: company.id,
    details: { amount: input.amount },
  });
  return tx;
}

export async function getStatement(id: string) {
  const profile = await getCorporateProfile(id);
  const now = Date.now();
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0 };
  for (const t of profile.creditTransactions) {
    if (t.transactionType !== "DEBIT_CHARGE") continue;
    const age = (now - t.createdAt.getTime()) / 86400000;
    const amt = Number(t.amount);
    if (age <= 30) buckets.current += amt;
    else if (age <= 60) buckets.d30 += amt;
    else if (age <= 90) buckets.d60 += amt;
    else buckets.d90 += amt;
  }
  return {
    company: profile,
    outstanding: Number(profile.currentOutstanding),
    creditLimit: Number(profile.creditLimit),
    available: Number(profile.creditLimit) - Number(profile.currentOutstanding),
    aging: buckets,
    transactions: profile.creditTransactions,
  };
}

export async function chargeToCorporate(input: {
  companyId: string;
  amount: number;
  referenceDetails: string;
  userId: string;
  override?: boolean;
}) {
  const company = await prisma.corporateProfile.findUnique({ where: { id: input.companyId } });
  if (!company?.isActive) throw new AppError(400, "COR-002", "Company is inactive");
  if (!company.isCreditApproved) throw new AppError(400, "COR-003", "Credit not approved");
  const projected = Number(company.currentOutstanding) + input.amount;
  if (projected > Number(company.creditLimit) && !input.override) {
    throw new AppError(400, "COR-004", "Charge would exceed credit limit");
  }
  return prisma.$transaction(async (db) => {
    const updated = await db.corporateProfile.update({
      where: { id: company.id },
      data: { currentOutstanding: projected },
    });
    return db.corporateCreditTransaction.create({
      data: {
        companyId: company.id,
        transactionType: CorporateCreditType.DEBIT_CHARGE,
        amount: input.amount,
        balanceAfter: Number(updated.currentOutstanding),
        referenceDetails: input.referenceDetails,
        createdById: input.userId,
      },
    });
  });
}
