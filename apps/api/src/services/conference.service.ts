import { ConferenceBookingStatus, FolioLineType, FolioStatus, ReservationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { nextDocumentNumber, writeAuditLog } from "./system.service.js";
import { taxFieldsForCharge } from "../lib/tax.js";
import { getProperty, paymentInstructions } from "../lib/property.js";

export async function listVenues() {
  return prisma.conferenceVenue.findMany({
    include: { _count: { select: { bookings: true } } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

export async function getVenue(id: string) {
  const venue = await prisma.conferenceVenue.findUnique({ where: { id }, include: { _count: { select: { bookings: true } } } });
  if (!venue) throw new AppError(404, "EVT-014", "Venue not found");
  return venue;
}

export async function createVenue(input: {
  name: string;
  locationDescription?: string | null;
  maxCapacityChairsOnly: number;
  maxCapacityTracers: number;
  maxCapacityRoundTables: number;
  halfDayRate: number;
  fullDayRate: number;
  userId: string;
}) {
  const venue = await prisma.conferenceVenue.create({
    data: {
      name: input.name.trim(),
      locationDescription: input.locationDescription?.trim() || null,
      maxCapacityChairsOnly: input.maxCapacityChairsOnly,
      maxCapacityTracers: input.maxCapacityTracers,
      maxCapacityRoundTables: input.maxCapacityRoundTables,
      halfDayRate: input.halfDayRate,
      fullDayRate: input.fullDayRate,
    },
    include: { _count: { select: { bookings: true } } },
  });
  await writeAuditLog({ userId: input.userId, module: "Conference", action: "VENUE_CREATED", entityType: "ConferenceVenue", entityId: venue.id, details: { name: venue.name } });
  return venue;
}

export async function updateVenue(id: string, input: {
  name?: string;
  locationDescription?: string | null;
  maxCapacityChairsOnly?: number;
  maxCapacityTracers?: number;
  maxCapacityRoundTables?: number;
  halfDayRate?: number;
  fullDayRate?: number;
  isActive?: boolean;
  userId: string;
}) {
  const current = await prisma.conferenceVenue.findUnique({ where: { id } });
  if (!current) throw new AppError(404, "EVT-014", "Venue not found");
  const venue = await prisma.conferenceVenue.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      locationDescription: input.locationDescription === undefined ? undefined : input.locationDescription?.trim() || null,
      maxCapacityChairsOnly: input.maxCapacityChairsOnly,
      maxCapacityTracers: input.maxCapacityTracers,
      maxCapacityRoundTables: input.maxCapacityRoundTables,
      halfDayRate: input.halfDayRate,
      fullDayRate: input.fullDayRate,
      isActive: input.isActive,
    },
    include: { _count: { select: { bookings: true } } },
  });
  await writeAuditLog({ userId: input.userId, module: "Conference", action: "VENUE_UPDATED", entityType: "ConferenceVenue", entityId: venue.id, details: { name: venue.name, isActive: venue.isActive } });
  return venue;
}

export async function deleteVenue(id: string, userId: string) {
  const venue = await prisma.conferenceVenue.findUnique({ where: { id }, include: { _count: { select: { bookings: true } } } });
  if (!venue) throw new AppError(404, "EVT-014", "Venue not found");
  if (venue._count.bookings > 0) {
    const archived = await prisma.conferenceVenue.update({ where: { id }, data: { isActive: false } });
    await writeAuditLog({ userId, module: "Conference", action: "VENUE_ARCHIVED", entityType: "ConferenceVenue", entityId: id, details: { name: venue.name, bookingCount: venue._count.bookings } });
    return { deleted: false, archived: true, message: "Venue has bookings and was archived. Existing booking history is preserved." , venue: archived };
  }
  await prisma.conferenceVenue.delete({ where: { id } });
  await writeAuditLog({ userId, module: "Conference", action: "VENUE_DELETED", entityType: "ConferenceVenue", entityId: id, details: { name: venue.name } });
  return { deleted: true, archived: false, message: "Venue deleted." };
}

export async function listPackages(venueId: string) {
  return prisma.conferencePackage.findMany({ where: { isActive: true, venueId }, orderBy: { name: "asc" } });
}

export async function listResources() {
  return prisma.conferenceResource.findMany({ orderBy: { name: "asc" } });
}

export async function listBookings() {
  return prisma.conferenceBooking.findMany({
    include: { venue: true, package: true, company: true, reservation: { include: { guest: true, room: true } }, folioChargeLine: true, resources: { include: { resource: true } } },
    orderBy: { startTimestamp: "asc" },
    take: 100,
  });
}

export async function buildConferenceProformaDocument(id: string) {
  const booking = await prisma.conferenceBooking.findUnique({
    where: { id },
    include: {
      venue: true,
      package: true,
      company: true,
      groupReservation: { include: { company: true } },
      reservation: { include: { guest: true, room: { include: { roomType: true } } } },
      resources: { include: { resource: true } },
    },
  });
  if (!booking) throw new AppError(404, "EVT-004", "Booking not found");

  const property = await getProperty();
  const resourceTotal = booking.resources.reduce((sum, allocation) => sum + Number(allocation.subtotal), 0);
  const packageAmount = booking.package ? Number(booking.package.ratePerPax) * booking.estimatedPax : 0;
  const otherAmount = Number(booking.totalAmount) - Number(booking.baseVenueCost) - packageAmount - resourceTotal;
  const items = [
    { description: `Venue hire · ${booking.venue.name}`, amount: Number(booking.baseVenueCost) },
    ...(packageAmount > 0 && booking.package ? [{ description: `${booking.package.name} · ${booking.estimatedPax} attendees`, amount: packageAmount }] : []),
    ...booking.resources.map((allocation) => ({
      description: `${allocation.resource.name} · quantity ${allocation.quantityAllocated}`,
      amount: Number(allocation.subtotal),
    })),
    ...(Math.abs(otherAmount) > 0.01 ? [{ description: "Other conference charges", amount: otherAmount }] : []),
  ].filter((item) => item.amount > 0);

  const lines = items.map((item) => {
    const tax = taxFieldsForCharge({ amount: item.amount, department: "CONFERENCE" });
    return {
      description: item.description,
      department: tax.department,
      net: tax.netAmount,
      vat: tax.vatAmount,
      levy: tax.levyAmount,
      gross: tax.amount,
      date: booking.startTimestamp,
    };
  });
  const taxSummary = {
    net: lines.reduce((sum, line) => sum + line.net, 0),
    vat: lines.reduce((sum, line) => sum + line.vat, 0),
    levy: lines.reduce((sum, line) => sum + line.levy, 0),
    gross: lines.reduce((sum, line) => sum + line.gross, 0),
  };
  const organization = booking.company?.companyName
    ?? booking.groupReservation?.company?.companyName
    ?? booking.groupReservation?.groupName
    ?? null;
  const guestName = booking.reservation
    ? `${booking.reservation.guest.firstName} ${booking.reservation.guest.lastName}`
    : booking.contactName;

  return {
    type: "proforma",
    documentTitle: "PRO FORMA INVOICE",
    documentNumber: `PF-${booking.bookingNumber}`,
    issuedAt: new Date().toISOString(),
    property: {
      name: property.propertyName,
      address: property.address,
      vatNumber: property.vatNumber,
      tinNumber: property.tinNumber,
      bpNumber: property.bpNumber,
      ztaLevyRatePercent: Number(property.ztaLevyRatePercent),
      phone: property.contactPhone,
      netoneNumber: property.netoneNumber,
      whatsappNumber: property.whatsappNumber,
      email: property.contactEmail,
    },
    guest: {
      name: guestName,
      email: booking.reservation?.guest.email ?? null,
      phone: booking.reservation?.guest.phone ?? null,
      nationality: booking.reservation?.guest.nationality ?? null,
      nationalId: booking.reservation?.guest.nationalId ?? null,
      address: booking.reservation?.guest.address ?? null,
      organization,
    },
    stay: {
      room: booking.reservation?.room?.number ?? null,
      roomType: booking.reservation?.room?.roomType.name ?? `Conference · ${booking.venue.name}`,
      checkIn: booking.reservation?.checkInDate ?? null,
      checkOut: booking.reservation?.checkOutDate ?? null,
      eventStart: booking.startTimestamp,
      eventEnd: booking.endTimestamp,
    },
    lines,
    payments: Number(booking.depositPaid) > 0
      ? [{ description: "Conference deposit received", method: null, amount: Number(booking.depositPaid), date: booking.updatedAt }]
      : [],
    taxSummary,
    balance: taxSummary.gross - Number(booking.depositPaid),
    services: [],
    paymentInstructions: paymentInstructions(property),
  };
}

export async function listInHouseReservations() {
  return prisma.reservation.findMany({
    where: { status: ReservationStatus.CHECKED_IN },
    include: { guest: true, room: true },
    orderBy: { room: { number: "asc" } },
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
  customVenueRate?: number;
  packageId?: string;
  groupReservationId?: string;
  companyId?: string;
  reservationId?: string;
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
  const standardVenueRate = hours <= 5 ? Number(venue.halfDayRate) : Number(venue.fullDayRate);
  const baseVenueCost = input.customVenueRate ?? standardVenueRate;
  let packageCost = 0;
  if (input.packageId) {
    const pkg = await prisma.conferencePackage.findUnique({ where: { id: input.packageId } });
    if (!pkg?.isActive || pkg.venueId !== input.venueId) {
      throw new AppError(400, "EVT-015", "Select an active package assigned to the chosen venue");
    }
    packageCost = Number(pkg.ratePerPax) * input.estimatedPax;
  }

  const bookingNumber = await nextDocumentNumber("CONFERENCE");
  const booking = await prisma.conferenceBooking.create({
    data: {
      bookingNumber,
      venueId: input.venueId,
      packageId: input.packageId,
      groupReservationId: input.groupReservationId,
      companyId: input.companyId,
      reservationId: input.reservationId,
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
    details: { bookingNumber, baseVenueCost, customVenueRateApplied: input.customVenueRate !== undefined },
  });
  return booking;
}

export async function completeBooking(id: string, userId: string, ipAddress?: string) {
  const booking = await prisma.conferenceBooking.findUnique({ where: { id } });
  if (!booking) throw new AppError(404, "EVT-004", "Booking not found");
  if (!booking.reservationId) throw new AppError(400, "EVT-008", "Link an in-house reservation before completing and billing this event");
  if (booking.status !== ConferenceBookingStatus.CONFIRMED && booking.status !== ConferenceBookingStatus.IN_PROGRESS) {
    throw new AppError(400, "EVT-009", "Only confirmed or in-progress events can be completed");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: booking.reservationId! },
      include: { folios: { where: { status: FolioStatus.OPEN }, include: { lines: true }, take: 1 } },
    });
    if (!reservation || reservation.status !== ReservationStatus.CHECKED_IN) {
      throw new AppError(400, "EVT-010", "The linked reservation must still be checked in");
    }
    if (reservation.cashOnly) throw new AppError(400, "EVT-011", "This reservation is marked cash-only");
    const folio = reservation.folios[0];
    if (!folio) throw new AppError(400, "EVT-012", "No open folio is available for this reservation");

    const claim = await tx.conferenceBooking.updateMany({
      where: { id, status: { in: [ConferenceBookingStatus.CONFIRMED, ConferenceBookingStatus.IN_PROGRESS] } },
      data: { status: ConferenceBookingStatus.COMPLETED },
    });
    if (claim.count !== 1) throw new AppError(409, "EVT-013", "Event was already completed or changed");

    const tax = taxFieldsForCharge({ amount: Number(booking.totalAmount), department: "CONFERENCE" });
    await tx.folioLine.create({
      data: {
        folioId: folio.id,
        lineType: FolioLineType.CHARGE,
        description: `Conference event ${booking.bookingNumber}`,
        amount: tax.amount,
        department: tax.department,
        taxRate: tax.taxRate,
        netAmount: tax.netAmount,
        vatAmount: tax.vatAmount,
        levyAmount: tax.levyAmount,
        postedById: userId,
        conferenceBookingId: id,
      },
    });
    return tx.conferenceBooking.findUniqueOrThrow({
      where: { id },
      include: { venue: true, package: true, reservation: { include: { guest: true, room: true } }, folioChargeLine: true, resources: { include: { resource: true } } },
    });
  });

  await writeAuditLog({
    userId,
    module: "Conference",
    action: "EVENT_COMPLETED_AND_BILLED",
    entityType: "ConferenceBooking",
    entityId: id,
    details: { reservationId: booking.reservationId, amount: Number(booking.totalAmount) },
    ipAddress,
  });
  return updated;
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
