import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { BookingSource, FolioLineType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { signGuestToken, type GuestAuth } from "../middleware/guest-auth.js";
import { createOnlineBooking, publicProperty } from "./public-booking.service.js";

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "Guest";
  const lastName = parts.slice(1).join(" ") || firstName;
  return { firstName, lastName };
}

export function serializeGuest(guest: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  nationality: string | null;
  nationalId: string | null;
  passportNumber: string | null;
  gender: string | null;
  companyName: string | null;
  address: string | null;
  carRegistration: string | null;
  nextOfKin: string | null;
}) {
  return {
    id: guest.id,
    firstName: guest.firstName,
    lastName: guest.lastName,
    fullName: `${guest.firstName} ${guest.lastName}`.trim(),
    email: guest.email,
    phone: guest.phone,
    nationality: guest.nationality,
    nationalId: guest.nationalId,
    passportNumber: guest.passportNumber,
    idPassport: guest.nationalId || guest.passportNumber || "",
    gender: guest.gender,
    companyName: guest.companyName,
    address: guest.address,
    carRegistration: guest.carRegistration,
    nextOfKin: guest.nextOfKin,
  };
}

function authPayload(guest: { id: string; email: string; firstName: string; lastName: string }): GuestAuth {
  return {
    id: guest.id,
    email: guest.email,
    firstName: guest.firstName,
    lastName: guest.lastName,
  };
}

export async function signupGuest(input: { fullName: string; email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  if (input.password.length < 8) {
    throw new AppError(400, "GST-AUTH-003", "Password must be at least 8 characters");
  }

  const { firstName, lastName } = splitFullName(input.fullName);
  const passwordHash = await bcrypt.hash(input.password, 10);
  const existing = await prisma.guest.findUnique({ where: { email } });

  let guest;
  if (existing) {
    if (existing.passwordHash) {
      throw new AppError(409, "GST-AUTH-004", "An account with this email already exists. Please sign in.");
    }
    guest = await prisma.guest.update({
      where: { id: existing.id },
      data: { firstName, lastName, passwordHash },
    });
  } else {
    guest = await prisma.guest.create({
      data: { firstName, lastName, email, passwordHash },
    });
  }

  const user = authPayload(guest);
  return { token: signGuestToken(user), guest: serializeGuest(guest) };
}

export async function loginGuest(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const guest = await prisma.guest.findUnique({ where: { email } });
  if (!guest?.passwordHash) {
    throw new AppError(401, "GST-AUTH-005", "Invalid email or password");
  }
  const valid = await bcrypt.compare(input.password, guest.passwordHash);
  if (!valid) {
    throw new AppError(401, "GST-AUTH-005", "Invalid email or password");
  }
  const user = authPayload(guest);
  return { token: signGuestToken(user), guest: serializeGuest(guest) };
}

export async function getGuestProfile(guestId: string) {
  const guest = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!guest) throw new AppError(404, "GST-001", "Guest not found");
  return serializeGuest(guest);
}

export async function updateGuestProfile(guestId: string, input: {
  firstName?: string;
  lastName?: string;
  phone?: string;
  nationality?: string;
  gender?: string;
  companyName?: string;
  address?: string;
  carRegistration?: string;
  nextOfKin?: string;
  idPassport?: string;
}) {
  const current = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!current) throw new AppError(404, "GST-001", "Guest not found");

  const data: Record<string, string | null> = {};

  if (input.firstName !== undefined) data.firstName = input.firstName.trim();
  if (input.lastName !== undefined) data.lastName = input.lastName.trim();
  if (input.phone !== undefined) data.phone = input.phone.trim() || null;
  if (input.nationality !== undefined) data.nationality = input.nationality.trim();
  if (input.gender !== undefined) data.gender = input.gender.trim() || null;
  if (input.companyName !== undefined) data.companyName = input.companyName.trim() || null;
  if (input.address !== undefined) data.address = input.address.trim() || null;
  if (input.carRegistration !== undefined) data.carRegistration = input.carRegistration.trim() || null;
  if (input.nextOfKin !== undefined) data.nextOfKin = input.nextOfKin.trim() || null;

  if (input.idPassport !== undefined) {
    const value = input.idPassport.trim();
    if (value) {
      if (/[A-Za-z]/.test(value)) {
        data.passportNumber = value;
      } else {
        data.nationalId = value;
      }
    }
  }

  const guest = await prisma.guest.update({ where: { id: guestId }, data: data as Prisma.GuestUpdateInput });
  return serializeGuest(guest);
}

export async function updateGuestPassword(guestId: string, input: { currentPassword: string; newPassword: string }) {
  if (input.newPassword.length < 8) {
    throw new AppError(400, "GST-AUTH-003", "Password must be at least 8 characters");
  }
  const guest = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!guest?.passwordHash) {
    throw new AppError(400, "GST-AUTH-006", "Set a password by signing up first");
  }
  const valid = await bcrypt.compare(input.currentPassword, guest.passwordHash);
  if (!valid) {
    throw new AppError(401, "GST-AUTH-007", "Current password is incorrect");
  }
  await prisma.guest.update({
    where: { id: guestId },
    data: { passwordHash: await bcrypt.hash(input.newPassword, 10) },
  });
  return { ok: true };
}

function nightsBetween(checkIn: Date, checkOut: Date) {
  return Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000));
}

function serializeReservation(reservation: {
  id: string;
  reservationNumber: string;
  checkInDate: Date;
  checkOutDate: Date;
  adults: number;
  children: number;
  status: string;
  specialRequests: string | null;
  guestPaymentMethod: string | null;
  guest: { firstName: string; lastName: string; email: string; phone: string | null; nationality: string | null; nationalId: string | null; passportNumber: string | null; companyName: string | null };
  ratePlan: { baseRate: unknown; roomType: { name: string; description: string | null } };
  room: { number: string; roomType: { name: string } } | null;
}) {
  const nights = nightsBetween(reservation.checkInDate, reservation.checkOutDate);
  const nightly = Number(reservation.ratePlan.baseRate);
  const roomType = reservation.room?.roomType.name ?? reservation.ratePlan.roomType.name;
  return {
    id: reservation.id,
    reservationNumber: reservation.reservationNumber,
    roomNumber: reservation.room?.number ?? "—",
    roomType,
    roomDescription: reservation.ratePlan.roomType.description,
    checkInDate: reservation.checkInDate.toISOString().slice(0, 10),
    checkOutDate: reservation.checkOutDate.toISOString().slice(0, 10),
    nights,
    adults: reservation.adults,
    children: reservation.children,
    status: reservation.status,
    nightlyRate: nightly,
    totalPrice: nightly * nights,
    paymentMethod: reservation.guestPaymentMethod,
    specialRequests: reservation.specialRequests,
    guest: {
      firstName: reservation.guest.firstName,
      lastName: reservation.guest.lastName,
      email: reservation.guest.email,
      phone: reservation.guest.phone,
      nationality: reservation.guest.nationality,
      idPassport: reservation.guest.nationalId || reservation.guest.passportNumber || "",
      companyName: reservation.guest.companyName,
    },
  };
}

const reservationInclude = {
  guest: true,
  ratePlan: { include: { roomType: true } },
  room: { include: { roomType: true } },
} as const;

export async function listGuestBookings(guestId: string) {
  const guest = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!guest) throw new AppError(404, "GST-001", "Guest not found");

  const reservations = await prisma.reservation.findMany({
    where: {
      OR: [{ guestId }, { guest: { email: guest.email } }],
    },
    include: reservationInclude,
    orderBy: { checkInDate: "desc" },
  });
  return reservations.map(serializeReservation);
}

export async function getGuestBooking(guestId: string, reservationId: string) {
  const guest = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!guest) throw new AppError(404, "GST-001", "Guest not found");

  const reservation = await prisma.reservation.findFirst({
    where: {
      id: reservationId,
      OR: [{ guestId }, { guest: { email: guest.email } }],
    },
    include: {
      ...reservationInclude,
      folios: { include: { lines: { orderBy: { createdAt: "asc" } } } },
    },
  });
  if (!reservation) {
    throw new AppError(404, "RES-006", "Booking not found");
  }

  const folios = reservation.folios.map((folio) => summarizeFolio(folio));
  return {
    ...serializeReservation(reservation),
    folios,
    invoices: folios.filter((f) => f.invoiceNumber).map((f) => ({
      id: f.id,
      invoiceNumber: f.invoiceNumber,
      issuedDate: f.createdAt,
      totalAmount: f.totalBilled,
    })),
    payments: folios.flatMap((f) => f.payments),
    charges: folios.flatMap((f) => f.charges),
  };
}

function summarizeFolio(folio: {
  id: string;
  invoiceNumber: string | null;
  receiptNumber: string | null;
  status: string;
  createdAt: Date;
  reservationId: string;
  lines: {
    id: string;
    lineType: FolioLineType;
    description: string;
    amount: unknown;
    paymentMethod: string | null;
    createdAt: Date;
  }[];
}) {
  const charges = folio.lines
    .filter((l) => l.lineType !== FolioLineType.PAYMENT)
    .map((l) => ({
      id: l.id,
      description: l.description,
      amount: Number(l.amount),
      createdAt: l.createdAt.toISOString(),
    }));
  const payments = folio.lines
    .filter((l) => l.lineType === FolioLineType.PAYMENT)
    .map((l) => ({
      id: l.id,
      folioId: folio.id,
      amount: Number(l.amount),
      paymentMethod: l.paymentMethod,
      paymentDate: l.createdAt.toISOString().slice(0, 10),
    }));
  const totalBilled = charges.reduce((s, l) => s + l.amount, 0);
  const totalPaid = payments.reduce((s, l) => s + l.amount, 0);
  return {
    id: folio.id,
    reservationId: folio.reservationId,
    invoiceNumber: folio.invoiceNumber,
    receiptNumber: folio.receiptNumber,
    status: folio.status,
    createdAt: folio.createdAt.toISOString().slice(0, 10),
    totalBilled,
    totalPaid,
    balance: Math.round((totalBilled - totalPaid) * 100) / 100,
    charges,
    payments,
  };
}

export async function getGuestBilling(guestId: string) {
  const guest = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!guest) throw new AppError(404, "GST-001", "Guest not found");

  const folios = await prisma.folio.findMany({
    where: {
      OR: [{ guestId }, { guest: { email: guest.email } }],
    },
    include: {
      lines: { orderBy: { createdAt: "asc" } },
      reservation: { select: { reservationNumber: true, checkInDate: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const summaries = folios.map((folio) => ({
    ...summarizeFolio(folio),
    reservationNumber: folio.reservation.reservationNumber,
  }));
  const invoices = summaries
    .filter((f) => f.invoiceNumber)
    .map((f) => ({
      id: f.id,
      invoiceNumber: f.invoiceNumber as string,
      issuedDate: f.createdAt,
      totalAmount: f.totalBilled,
      status: f.status,
      reservationNumber: f.reservationNumber,
    }));
  const payments = summaries.flatMap((f) => f.payments.map((p) => ({
    ...p,
    invoiceNumber: f.invoiceNumber,
    reservationNumber: f.reservationNumber,
  })));
  const totalBilled = invoices.reduce((s, i) => s + i.totalAmount, 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

  return {
    totalBilled,
    totalPaid,
    outstanding: Math.round((totalBilled - totalPaid) * 100) / 100,
    invoices,
    payments,
  };
}

export async function placeGuestBooking(guestId: string, input: {
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children?: number;
  ratePlanId: string;
  specialRequests?: string;
  paymentMethod?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  nationality?: string;
  nationalId?: string;
  passportNumber?: string;
  idPassport?: string;
  gender?: string;
  companyName?: string;
  address?: string;
  ipAddress?: string;
}) {
  const guest = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!guest) throw new AppError(404, "GST-001", "Guest not found");

  const idPassport = input.idPassport?.trim();
  const nationalId = input.nationalId ?? (idPassport && !/[A-Za-z]/.test(idPassport) ? idPassport : guest.nationalId);
  const passportNumber = input.passportNumber ?? (idPassport && /[A-Za-z]/.test(idPassport) ? idPassport : guest.passportNumber);

  return createOnlineBooking({
    firstName: input.firstName ?? guest.firstName,
    lastName: input.lastName ?? guest.lastName,
    email: guest.email,
    phone: input.phone ?? guest.phone ?? undefined,
    nationality: input.nationality ?? guest.nationality ?? "",
    nationalId: nationalId ?? undefined,
    passportNumber: passportNumber ?? undefined,
    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
    adults: input.adults,
    children: input.children,
    ratePlanId: input.ratePlanId,
    specialRequests: input.specialRequests,
    paymentMethod: input.paymentMethod,
    gender: input.gender,
    companyName: input.companyName,
    address: input.address,
    ipAddress: input.ipAddress,
  });
}

export async function publicRoomCatalog() {
  const roomTypes = await prisma.roomType.findMany({
    include: { ratePlans: { where: { isActive: true }, take: 1, orderBy: { baseRate: "asc" } } },
    orderBy: { baseRate: "asc" },
  });
  const property = await publicProperty();
  return {
    property,
    rooms: roomTypes.map((rt) => ({
      roomTypeId: rt.id,
      code: rt.code,
      name: rt.name,
      description: rt.description ?? `${rt.name} at Manica Skyview Hotel`,
      maxAdults: rt.maxAdults,
      maxChildren: rt.maxChildren,
      maxOccupancy: rt.maxAdults + rt.maxChildren,
      nightlyRate: String(rt.ratePlans[0]?.baseRate ?? rt.baseRate),
      ratePlanId: rt.ratePlans[0]?.id ?? null,
    })),
  };
}
