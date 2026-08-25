"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GuestGate } from "@/components/portal/GuestGate";
import { guestApiFetch } from "@/lib/guest-api";
import { formatLongDate, formatMoney } from "@/lib/portal";

interface BookingDetail {
  id: string;
  reservationNumber: string;
  roomNumber: string;
  roomType: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  adults: number;
  children: number;
  status: string;
  nightlyRate: number;
  totalPrice: number;
  paymentMethod: string | null;
  guest: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    nationality: string | null;
    idPassport: string;
    companyName: string | null;
  };
  invoices: { id: string; invoiceNumber: string; issuedDate: string; totalAmount: number }[];
  payments: { id: string; amount: number; paymentMethod: string | null; paymentDate: string }[];
  charges: { id: string; description: string; amount: number }[];
}

function Confirmation() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [booking, setBooking] = useState<BookingDetail | null>(null);

  useEffect(() => {
    guestApiFetch<{ booking: BookingDetail }>(`/api/guest/bookings/${id}`)
      .then((d) => setBooking(d.booking))
      .catch(() => router.replace("/my-bookings"));
  }, [id, router]);

  if (!booking) return <div className="p-8 text-center text-muted-foreground">Loading reservation…</div>;

  const paymentLabel = booking.paymentMethod === "bank_transfer" ? "Bank Transfer" : booking.paymentMethod === "pay_on_arrival" ? "Pay on Arrival" : "—";

  function printConfirmation() {
    window.print();
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 no-print">
        <Link href="/my-bookings" className="text-sm text-muted-foreground hover:text-foreground">← My bookings</Link>
        <button type="button" className="msh-btn msh-btn-outline" onClick={printConfirmation}>Print confirmation</button>
      </div>
      <div className="rounded-lg border bg-card p-6 md:p-8 print:border-0 print:shadow-none">
        <div className="text-center border-b pb-5 mb-6" style={{ borderColor: "#7c2d12" }}>
          <h1 className="text-2xl font-display font-bold" style={{ color: "#7c2d12" }}>Booking Confirmation</h1>
          <p className="text-sm text-muted-foreground mt-1">Manica Skyview Hotel · Mutare, Zimbabwe</p>
        </div>
        <p className="text-sm mb-6"><span className="text-muted-foreground">Booking ID</span> · <strong>{booking.reservationNumber}</strong></p>
        <div className="grid sm:grid-cols-2 gap-8">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Guest</h3>
            <p className="font-medium">{booking.guest.firstName} {booking.guest.lastName}</p>
            <p className="text-sm">{booking.guest.email}</p>
            {booking.guest.phone && <p className="text-sm">{booking.guest.phone}</p>}
            {booking.guest.idPassport && <p className="text-sm">ID / Passport: {booking.guest.idPassport}</p>}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Stay Details</h3>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-muted-foreground">Check-in:</span>
              <span className="font-medium">{formatLongDate(booking.checkInDate)}</span>
              <span className="text-muted-foreground">Check-out:</span>
              <span className="font-medium">{formatLongDate(booking.checkOutDate)}</span>
              <span className="text-muted-foreground">Nights:</span>
              <span className="font-medium">{booking.nights}</span>
              <span className="text-muted-foreground">Room:</span>
              <span className="font-medium">{booking.roomType} {booking.roomNumber !== "—" ? `· ${booking.roomNumber}` : ""}</span>
              <span className="text-muted-foreground">Guests:</span>
              <span className="font-medium">{booking.adults} adult{booking.adults !== 1 ? "s" : ""}{booking.children ? `, ${booking.children} child${booking.children !== 1 ? "ren" : ""}` : ""}</span>
              <span className="text-muted-foreground">Payment:</span>
              <span className="font-medium">{paymentLabel}</span>
            </div>
          </div>
        </div>
        <div className="mt-8">
          <div className="flex justify-between text-sm py-1"><span>Room Rate</span><span>{formatMoney(booking.nightlyRate)} × {booking.nights}</span></div>
          {booking.charges.map((c) => (
            <div key={c.id} className="flex justify-between text-sm py-1"><span>{c.description}</span><span>{formatMoney(c.amount)}</span></div>
          ))}
          <div className="flex justify-between text-lg font-bold pt-3 mt-2 border-t">
            <span>Total</span>
            <span>{formatMoney(booking.totalPrice)}</span>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-10 pt-4 border-t">
          Your booking is confirmed. Payment is settled at check-in unless a bank transfer has been arranged.
        </p>
      </div>
    </div>
  );
}

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <GuestGate next={`/my-bookings/${id}`}>
      <Confirmation />
    </GuestGate>
  );
}
