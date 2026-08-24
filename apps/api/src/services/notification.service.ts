import { NotificationChannel, NotificationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { writeAuditLog } from "./system.service.js";

function applyPlaceholders(pattern: string, vars: Record<string, string>) {
  return pattern.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

function inQuietHours(date = new Date()) {
  const hour = date.getHours();
  return hour >= 20 || hour < 7;
}

export async function listTemplates() {
  return prisma.messageTemplate.findMany({ orderBy: { name: "asc" } });
}

export async function createTemplate(input: {
  name: string;
  channel: NotificationChannel;
  subjectPattern?: string;
  bodyPattern: string;
}) {
  const template = await prisma.messageTemplate.create({ data: input });
  await writeAuditLog({
    module: "Notifications",
    action: "TEMPLATE_EDITED",
    entityType: "MessageTemplate",
    entityId: template.id,
  });
  return template;
}

export async function listQueue(status?: NotificationStatus) {
  return prisma.notificationQueue.findMany({
    where: status ? { status } : undefined,
    include: { template: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function sendDirect(input: {
  templateName?: string;
  recipientContact: string;
  channel: NotificationChannel;
  variables?: Record<string, string>;
  subject?: string;
  body?: string;
  guestId?: string;
  transactional?: boolean;
}) {
  if (input.guestId && !input.transactional && (input.channel === "EMAIL" || input.channel === "SMS")) {
    const consent = await prisma.communicationConsentLog.findUnique({
      where: { guestId_channel: { guestId: input.guestId, channel: input.channel } },
    });
    if (consent && !consent.isOptIn) {
      throw new AppError(400, "NTF-001", "Guest has opted out of this channel");
    }
  }

  let subject = input.subject;
  let body = input.body ?? "";
  let templateId: string | undefined;
  if (input.templateName) {
    const template = await prisma.messageTemplate.findUnique({ where: { name: input.templateName } });
    if (!template?.isActive) throw new AppError(404, "NTF-002", "Template not found");
    templateId = template.id;
    subject = applyPlaceholders(template.subjectPattern ?? "", input.variables ?? {});
    body = applyPlaceholders(template.bodyPattern, input.variables ?? {});
  }

  const quiet = !input.transactional && input.channel === "SMS" && inQuietHours();
  const scheduledTime = quiet
    ? (() => {
        const d = new Date();
        if (d.getHours() >= 20) d.setDate(d.getDate() + 1);
        d.setHours(7, 0, 0, 0);
        return d;
      })()
    : new Date();

  const item = await prisma.notificationQueue.create({
    data: {
      templateId,
      recipientContact: input.recipientContact,
      channel: input.channel,
      subject,
      body,
      scheduledTime,
      status: quiet ? NotificationStatus.PENDING : NotificationStatus.SENT,
      sentTime: quiet ? null : new Date(),
    },
  });
  return item;
}

export async function retryNotification(id: string) {
  const item = await prisma.notificationQueue.findUnique({ where: { id } });
  if (!item) throw new AppError(404, "NTF-003", "Notification not found");
  if (item.retryCount >= 3) {
    return prisma.notificationQueue.update({
      where: { id },
      data: { status: NotificationStatus.FAILED, errorMessage: "Retry limit reached" },
    });
  }
  return prisma.notificationQueue.update({
    where: { id },
    data: {
      retryCount: { increment: 1 },
      status: NotificationStatus.SENT,
      sentTime: new Date(),
      errorMessage: null,
    },
  });
}

export async function updateConsent(guestId: string, channel: "EMAIL" | "SMS", isOptIn: boolean) {
  return prisma.communicationConsentLog.upsert({
    where: { guestId_channel: { guestId, channel } },
    create: { guestId, channel, isOptIn },
    update: { isOptIn, updatedDate: new Date() },
  });
}

async function deliverEmail(to: string, subject: string, body: string) {
  const host = process.env.SMTP_HOST;
  if (!host) {
    return { delivered: false, reason: "SMTP not configured — queued for reception inbox" };
  }
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@manicaskyview.co.zw",
      to,
      subject,
      text: body,
    });
    return { delivered: true };
  } catch (error) {
    return { delivered: false, reason: error instanceof Error ? error.message : "Email send failed" };
  }
}

export async function notifyReceptionOfOnlineBooking(reservation: {
  reservationNumber: string;
  checkInDate: Date;
  checkOutDate: Date;
  adults: number;
  guest: { firstName: string; lastName: string; email: string; phone: string | null; nationality: string | null };
  ratePlan: { name: string; roomType: { name: string } };
}) {
  const property = await prisma.propertyConfiguration.findFirst();
  const to = property?.receptionEmail || "reception@manicaskyview.co.zw";
  const subject = `Online booking ${reservation.reservationNumber}`;
  const body = [
    `A guest booked online.`,
    ``,
    `Booking: ${reservation.reservationNumber}`,
    `Guest: ${reservation.guest.firstName} ${reservation.guest.lastName}`,
    `Email: ${reservation.guest.email}`,
    `Phone: ${reservation.guest.phone ?? "—"}`,
    `Nationality: ${reservation.guest.nationality ?? "—"}`,
    `Room type: ${reservation.ratePlan.roomType.name}`,
    `Rate: ${reservation.ratePlan.name}`,
    `Arrive: ${reservation.checkInDate.toISOString().slice(0, 10)}`,
    `Depart: ${reservation.checkOutDate.toISOString().slice(0, 10)}`,
    `Adults: ${reservation.adults}`,
  ].join("\n");

  const delivery = await deliverEmail(to, subject, body);
  const item = await prisma.notificationQueue.create({
    data: {
      recipientContact: to,
      channel: NotificationChannel.EMAIL,
      subject,
      body,
      scheduledTime: new Date(),
      status: delivery.delivered ? NotificationStatus.SENT : NotificationStatus.PENDING,
      sentTime: delivery.delivered ? new Date() : null,
      errorMessage: delivery.delivered ? null : delivery.reason,
    },
  });
  await writeAuditLog({
    module: "Notifications",
    action: "ONLINE_BOOKING_ALERT",
    entityType: "Reservation",
    details: { reservationNumber: reservation.reservationNumber, to, delivered: delivery.delivered },
  });
  return item;
}
