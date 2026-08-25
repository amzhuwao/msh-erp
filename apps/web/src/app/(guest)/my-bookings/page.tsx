"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GuestGate } from "@/components/portal/GuestGate";
import { IconBed } from "@/components/portal/Icons";
import { guestApiFetch } from "@/lib/guest-api";
import { formatLongDate, formatMoney } from "@/lib/portal";

interface Booking {
  id: string;
  reservationNumber: string;
  roomNumber: string;
  roomType: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  status: string;
  totalPrice: number;
  adults: number;
  children: number;
}

function BookingsList() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    guestApiFetch<{ bookings: Booking[] }>("/api/guest/bookings")
      .then((d) => setBookings(d.bookings))
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = bookings.filter((b) => {
    const q = query.toLowerCase();
    return !q || b.roomType.toLowerCase().includes(q) || b.roomNumber.toLowerCase().includes(q) || b.status.toLowerCase().includes(q) || b.reservationNumber.toLowerCase().includes(q);
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-display font-bold mb-1">My Bookings</h1>
      <p className="text-sm text-muted-foreground mb-6">View reservations and open booking confirmations.</p>
      <input className="msh-input max-w-sm mb-6" placeholder="Search bookings…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <IconBed className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No bookings found.</p>
          <Link href="/browse" className="inline-flex msh-btn msh-btn-primary mt-4">Book a Room</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((b) => (
            <Link key={b.id} href={`/my-bookings/${b.id}`} className="block rounded-lg border bg-card p-5 hover:shadow-md transition-shadow">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display font-semibold">{b.roomType}</p>
                  <p className="text-sm text-muted-foreground">{b.reservationNumber} · Room {b.roomNumber}</p>
                </div>
                <span className="msh-badge bg-primary/10 text-primary capitalize">{b.status.toLowerCase().replace("_", " ")}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <div><span className="text-muted-foreground">Check-in</span><p className="font-medium">{formatLongDate(b.checkInDate)}</p></div>
                <div><span className="text-muted-foreground">Check-out</span><p className="font-medium">{formatLongDate(b.checkOutDate)}</p></div>
                <div><span className="text-muted-foreground">Nights</span><p className="font-medium">{b.nights}</p></div>
                <div><span className="text-muted-foreground">Total</span><p className="font-medium">{formatMoney(b.totalPrice)}</p></div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MyBookingsPage() {
  return (
    <GuestGate next="/my-bookings">
      <BookingsList />
    </GuestGate>
  );
}
