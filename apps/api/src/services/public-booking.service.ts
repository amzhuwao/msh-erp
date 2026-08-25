import { BookingSource } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { assertGuestIdentity } from "../lib/identity.js";
import { createReservation, searchAvailability } from "./reservation.service.js";
import { getProperty, paymentInstructions } from "../lib/property.js";

async function websiteUserId() {
  const user = await prisma.user.findUnique({ where: { username: "website" } });
  if (!user) throw new AppError(500, "SYS-002", "Online booking user is not configured");
  return user.id;
}

export async function publicProperty() {
  const property = await getProperty();
  return {
    propertyName: property.propertyName,
    address: property.address,
    contactPhone: property.contactPhone,
    netoneNumber: property.netoneNumber,
    whatsappNumber: property.whatsappNumber,
    contactEmail: property.contactEmail,
    checkInTime: property.checkInTime,
    checkOutTime: property.checkOutTime,
    paymentInstructions: paymentInstructions(property),
  };
}

export async function createOnlineBooking(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  nationality: string;
  nationalId?: string;
  passportNumber?: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children?: number;
  ratePlanId: string;
  specialRequests?: string;
  paymentMethod?: string;
  gender?: string;
  companyName?: string;
  address?: string;
  ipAddress?: string;
}) {
  assertGuestIdentity(input);
  const createdById = await websiteUserId();

  const availability = await searchAvailability(new Date(input.checkInDate), new Date(input.checkOutDate), input.adults);
  const match = availability.find((a) => a.ratePlanId === input.ratePlanId);
  if (!match) {
    throw new AppError(409, "WEB-001", "Selected room type is no longer available for those dates");
  }

  let guest = await prisma.guest.findUnique({ where: { email: input.email.toLowerCase() } });
  if (guest) {
    guest = await prisma.guest.update({
      where: { id: guest.id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? guest.phone,
        nationality: input.nationality,
        nationalId: input.nationalId ?? guest.nationalId,
        passportNumber: input.passportNumber ?? guest.passportNumber,
        gender: input.gender ?? guest.gender,
        companyName: input.companyName ?? guest.companyName,
        address: input.address ?? guest.address,
      },
    });
    assertGuestIdentity(guest);
  } else {
    guest = await prisma.guest.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email.toLowerCase(),
        phone: input.phone,
        nationality: input.nationality,
        nationalId: input.nationalId,
        passportNumber: input.passportNumber,
        gender: input.gender,
        companyName: input.companyName,
        address: input.address,
      },
    });
  }

  const reservation = await createReservation({
    guestId: guest.id,
    ratePlanId: input.ratePlanId,
    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
    adults: input.adults,
    children: input.children ?? 0,
    specialRequests: input.specialRequests,
    guestPaymentMethod: input.paymentMethod,
    source: BookingSource.ONLINE,
    createdById,
    ipAddress: input.ipAddress,
  });

  const property = await publicProperty();
  const nights = Math.max(1, Math.round(
    (new Date(input.checkOutDate).getTime() - new Date(input.checkInDate).getTime()) / 86_400_000,
  ));
  return {
    reservation,
    quote: {
      reservationNumber: reservation.reservationNumber,
      roomType: match.name,
      nightlyRate: match.nightlyRate,
      nights,
      total: Number(match.nightlyRate) * nights,
      paymentMethod: input.paymentMethod ?? "pay_on_arrival",
      paymentInstructions: property.paymentInstructions,
    },
  };
}
