import { ConferenceBookingStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { nextDocumentNumber, writeAuditLog } from "./system.service.js";

export async function listVenues() {
  return prisma.conferenceVenue.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

export async function listPackages() {
  return prisma.conferencePackage.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

export async function listResources() {
  return prisma.conferenceResource.findMany({ orderBy: { name: "asc" } });
}

export async function listBookings() {
  return prisma.conferenceBooking.findMany({
    include: { venue: true, package: true, company: true, resources: { include: { resource: true } } },
    orderBy: { startTimestamp: "asc" },
    take: 100,
  });
}

export async function checkVenueAvailability(venueId: string, start: Date, end: Date, excludeId?: string) {
  const overlap = await prisma.conferenceBooking.count({
    where: {
      venueId,
      id: excludeId ? { not: excludeId } : undefined,
      status: { in: ["TENTATIVE", "CONFIRMED", "IN_PROGRESS"] },
      startTimestamp: { lt: end },
      endTimestamp: { gt: start },
    },
  });
  return { available: overlap === 0, conflicts: overlap };
}

export async function createBooking(input: {
  venueId: string;
  contactName: string;
  startTimestamp: string;
  endTimestamp: string;
  setupStyle?: "BANQUET" | "BOARDROOM" | "USHAPE" | "CINEMA";
  estimatedPax: number;
  packageId?: string;
  groupReservationId?: string;
  companyId?: string;
  depositRequired?: number;
  userId: string;
}) {
  const start = new Date(input.startTimestamp);
  const end = new Date(input.endTimestamp);
  if (start >= end) throw new AppError(400, "EVT-002", "Start must be before end");

  const venue = await prisma.conferenceVenue.findUnique({ where: { id: input.venueId } });
  if (!venue?.isActive) throw new AppError(404, "EVT-003", "Venue not found");

  const availability = await checkVenueAvailability(input.venueId, start, end);
  if (!availability.available) throw new AppError(409, "EVT-001", "Venue Already Booked");

  const hours = (end.getTime() - start.getTime()) / 36e5;
  const baseVenueCost = hours <= 5 ? Number(venue.halfDayRate) : Number(venue.fullDayRate);
  let packageCost = 0;
  if (input.packageId) {
    const pkg = await prisma.conferencePackage.findUnique({ where: { id: input.packageId } });
    if (pkg) packageCost = Number(pkg.ratePerPax) * input.estimatedPax;
  }

  const bookingNumber = await nextDocumentNumber("CONFERENCE");
  const booking = await prisma.conferenceBooking.create({
    data: {
      bookingNumber,
      venueId: input.venueId,
      packageId: input.packageId,
      groupReservationId: input.groupReservationId,
      companyId: input.companyId,
      contactName: input.contactName,
      startTimestamp: start,
      endTimestamp: end,
      setupStyle: input.setupStyle ?? "BOARDROOM",
      estimatedPax: input.estimatedPax,
      depositRequired: input.depositRequired ?? 0,
      baseVenueCost,
      totalAmount: baseVenueCost + packageCost,
      createdById: input.userId,
    },
    include: { venue: true, package: true },
  });

  await writeAuditLog({
    userId: input.userId,
    module: "Conference",
    action: "EVENT_CREATED",
    entityType: "ConferenceBooking",
    entityId: booking.id,
    details: { bookingNumber },
  });
  return booking;
}

export async function confirmBooking(id: string, userId: string) {
  const booking = await prisma.conferenceBooking.findUnique({ where: { id } });
  if (!booking) throw new AppError(404, "EVT-004", "Booking not found");
  if (booking.status !== ConferenceBookingStatus.TENTATIVE) {
    throw new AppError(400, "EVT-005", "Only tentative bookings can be confirmed");
  }
  const updated = await prisma.conferenceBooking.update({
    where: { id },
    data: { status: ConferenceBookingStatus.CONFIRMED },
    include: { venue: true, package: true, resources: { include: { resource: true } } },
  });
  await writeAuditLog({
    userId,
    module: "Conference",
    action: "EVENT_CONFIRMED",
    entityType: "ConferenceBooking",
    entityId: id,
  });
  return updated;
}

export async function allocateResource(input: {
  bookingId: string;
  resourceId: string;
  quantity: number;
  userId: string;
}) {
  const booking = await prisma.conferenceBooking.findUnique({ where: { id: input.bookingId } });
  if (!booking) throw new AppError(404, "EVT-004", "Booking not found");
  const resource = await prisma.conferenceResource.findUnique({ where: { id: input.resourceId } });
  if (!resource) throw new AppError(404, "EVT-006", "Resource not found");

  const dayStart = new Date(booking.startTimestamp);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const used = await prisma.conferenceResourceAllocation.aggregate({
    where: {
      resourceId: input.resourceId,
      conferenceBooking: {
        status: { in: ["TENTATIVE", "CONFIRMED", "IN_PROGRESS"] },
        startTimestamp: { lt: dayEnd },
        endTimestamp: { gt: dayStart },
      },
    },
    _sum: { quantityAllocated: true },
  });
  const already = used._sum.quantityAllocated ?? 0;
  if (already + input.quantity > resource.totalInventoryCount) {
    throw new AppError(409, "EVT-007", "Resource over-allocated for this day");
  }

  const chargedRate = Number(resource.dailyRentalRate);
  const allocation = await prisma.conferenceResourceAllocation.create({
    data: {
      conferenceBookingId: input.bookingId,
      resourceId: input.resourceId,
      quantityAllocated: input.quantity,
      chargedRate,
      subtotal: chargedRate * input.quantity,
    },
    include: { resource: true },
  });

  await prisma.conferenceBooking.update({
    where: { id: input.bookingId },
    data: { totalAmount: { increment: allocation.subtotal } },
  });
  return allocation;
}

export async function kitchenSummary(date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return prisma.conferenceBooking.findMany({
    where: {
      startTimestamp: { lt: end },
      endTimestamp: { gt: start },
      status: { in: ["CONFIRMED", "IN_PROGRESS"] },
    },
    include: { venue: true, package: true },
    orderBy: { startTimestamp: "asc" },
  });
}
