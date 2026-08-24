"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { publicApiFetch } from "@/lib/api";

interface RoomTypeOption {
  roomTypeId: string;
  code: string;
  name: string;
  availableCount: number;
  nightlyRate: string;
  ratePlanId: string;
}

interface PaymentInfo {
  bankTransfer: { bankName: string | null; branch: string | null; accountName: string | null; accountNumber: string | null; swiftCode: string | null };
  ecocash: { number: string | null; merchant: string | null };
  onemoney: { number: string | null };
}

export default function BookPage() {
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState(2);
  const [rooms, setRooms] = useState<RoomTypeOption[]>([]);
  const [ratePlanId, setRatePlanId] = useState("");
  const [pay, setPay] = useState<PaymentInfo | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", nationality: "Zimbabwe",
    nationalId: "", passportNumber: "", specialRequests: "",
  });

  useEffect(() => {
    publicApiFetch<{ paymentInstructions: PaymentInfo }>("/api/public/property")
      .then((d) => setPay(d.paymentInstructions))
      .catch(() => undefined);
  }, []);

  async function search() {
    setError("");
    const data = await publicApiFetch<{ results: RoomTypeOption[] }>(
      `/api/public/availability?checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}`,
    );
    setRooms(data.results);
    if (data.results[0]) setRatePlanId(data.results[0].ratePlanId);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await publicApiFetch<{ reservation: { reservationNumber: string } }>("/api/public/bookings", {
        method: "POST",
        body: JSON.stringify({ ...form, checkInDate: checkIn, checkOutDate: checkOut, adults, ratePlanId }),
      });
      setResult(data.reservation.reservationNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Image src="/logo.png" alt="Manica Skyview" width={48} height={48} className="rounded-full" />
          <div>
            <div className="text-xs uppercase tracking-widest text-[hsl(var(--accent))]">Manica Skyview Hotel</div>
            <h1 className="text-2xl font-bold">Book a stay</h1>
          </div>
        </div>
        {result ? (
          <div className="msh-card p-6">
            <h2 className="text-xl font-semibold text-emerald-700">Booking confirmed</h2>
            <p className="mt-2">Your reservation number is <strong>{result}</strong>. Reception has been notified by email.</p>
            {pay && (
              <div className="mt-4 text-sm space-y-2">
                <p className="font-medium">Pay by bank transfer or EcoCash:</p>
                <p>CBZ / {pay.bankTransfer.accountName} · Acc {pay.bankTransfer.accountNumber} · {pay.bankTransfer.branch}</p>
                <p>EcoCash: {pay.ecocash.number} · Merchant {pay.ecocash.merchant}</p>
                <p>NetOne / OneMoney: {pay.onemoney.number}</p>
              </div>
            )}
            <Link href="/login" className="inline-block mt-4 text-sm text-[hsl(var(--accent))]">Staff login →</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="msh-card p-6 space-y-4">
            {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded">{error}</div>}
            <div className="grid md:grid-cols-3 gap-3">
              <input type="date" required className="msh-input" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
              <input type="date" required className="msh-input" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
              <input type="number" min={1} className="msh-input" value={adults} onChange={(e) => setAdults(Number(e.target.value))} />
            </div>
            <button type="button" className="msh-btn msh-btn-outline" onClick={search}>Check availability</button>
            {rooms.length > 0 && (
              <select className="msh-input" value={ratePlanId} onChange={(e) => setRatePlanId(e.target.value)}>
                {rooms.map((r) => (
                  <option key={r.ratePlanId} value={r.ratePlanId}>{r.name} · {r.availableCount} left · ${Number(r.nightlyRate).toFixed(2)}/night</option>
                ))}
              </select>
            )}
            <div className="grid md:grid-cols-2 gap-3">
              <input className="msh-input" required placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              <input className="msh-input" required placeholder="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              <input className="msh-input" required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input className="msh-input" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input className="msh-input" required placeholder="Nationality" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
              <input className="msh-input" placeholder="National ID" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} />
              <input className="msh-input" placeholder="Passport (if no ID)" value={form.passportNumber} onChange={(e) => setForm({ ...form, passportNumber: e.target.value })} />
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Nationality and either National ID or passport are required.</p>
            <button className="msh-btn msh-btn-primary" disabled={loading || !ratePlanId}>{loading ? "Booking…" : "Confirm booking"}</button>
            {pay && (
              <div className="text-xs text-[hsl(var(--muted-foreground))] border-t pt-3">
                Bank transfer: {pay.bankTransfer.bankName} {pay.bankTransfer.accountNumber} · EcoCash {pay.ecocash.number} · NetOne {pay.onemoney.number}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
