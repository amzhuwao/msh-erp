import { PipelineStage } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { writeAuditLog } from "./system.service.js";

export async function listLeads() {
  return prisma.salesLead.findMany({
    include: { assignedSalesUser: { select: { fullName: true } }, activities: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createLead(input: {
  companyName?: string;
  contactPerson: string;
  email: string;
  phone?: string;
  source?: "WEBSITE" | "WALK_IN" | "COLD_CALL" | "AGENCY" | "EVENT";
  estimatedValue?: number;
  userId: string;
}) {
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const duplicate = await prisma.salesLead.findFirst({
    where: {
      createdAt: { gte: since },
      pipelineStage: { notIn: ["LOST"] },
      OR: [
        { email: input.email },
        input.companyName ? { companyName: input.companyName } : undefined,
      ].filter(Boolean) as object[],
    },
  });
  if (duplicate) {
    throw new AppError(409, "CRM-001", "Active lead already exists for this email or company");
  }

  return prisma.salesLead.create({
    data: {
      companyName: input.companyName,
      contactPerson: input.contactPerson,
      email: input.email,
      phone: input.phone,
      source: input.source ?? "WEBSITE",
      estimatedValue: input.estimatedValue ?? 0,
      assignedSalesUserId: input.userId,
    },
  });
}

export async function updateLeadStage(id: string, stage: PipelineStage, userId: string) {
  const lead = await prisma.salesLead.update({
    where: { id },
    data: { pipelineStage: stage },
  });
  if (stage === "WON") {
    await writeAuditLog({
      userId,
      module: "CRM",
      action: "LEAD_WON",
      entityType: "SalesLead",
      entityId: id,
      details: { estimatedValue: Number(lead.estimatedValue) },
    });
  }
  return lead;
}

export async function addActivity(input: {
  leadId: string;
  activityType: "PHONE_CALL" | "EMAIL" | "MEETING" | "PRESENTATION";
  summary: string;
  activityDate: string;
  followUpRequired?: boolean;
  followUpDate?: string;
}) {
  return prisma.salesActivity.create({
    data: {
      leadId: input.leadId,
      activityType: input.activityType,
      summary: input.summary,
      activityDate: new Date(input.activityDate),
      followUpRequired: input.followUpRequired ?? false,
      followUpDate: input.followUpDate ? new Date(input.followUpDate) : undefined,
    },
  });
}

export async function createFeedback(input: {
  guestId: string;
  reservationId?: string;
  score: number;
  comments?: string;
}) {
  const isActionRequired = input.score < 4;
  const feedback = await prisma.guestFeedback.create({
    data: {
      guestId: input.guestId,
      reservationId: input.reservationId,
      score: input.score,
      comments: input.comments,
      isActionRequired,
      status: isActionRequired ? "UNDER_REVIEW" : "PENDING",
    },
  });
  if (isActionRequired) {
    await writeAuditLog({
      module: "CRM",
      action: "GUEST_COMPLAINT_LOGGED",
      entityType: "GuestFeedback",
      entityId: feedback.id,
      details: { score: input.score },
    });
  }
  return feedback;
}

export async function redeemLoyalty(input: { guestId: string; points: number; userId: string }) {
  const account = await prisma.loyaltyAccount.findFirst({ where: { guestId: input.guestId, isActive: true } });
  if (!account) throw new AppError(404, "CRM-002", "Loyalty account not found");
  const available = account.totalPointsAccrued - account.totalPointsRedeemed;
  if (input.points > available) throw new AppError(400, "CRM-003", "Insufficient loyalty points");
  const updated = await prisma.loyaltyAccount.update({
    where: { id: account.id },
    data: { totalPointsRedeemed: { increment: input.points } },
  });
  await writeAuditLog({
    userId: input.userId,
    module: "CRM",
    action: "LOYALTY_POINTS_REDEMPTION",
    entityType: "LoyaltyAccount",
    entityId: account.id,
    details: { points: input.points, guestId: input.guestId },
  });
  return updated;
}

export async function listFeedback() {
  return prisma.guestFeedback.findMany({
    include: { guest: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
