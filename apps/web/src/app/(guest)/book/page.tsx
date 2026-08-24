"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { IconBed, IconPeople, IconUser } from "@/components/portal/Icons";
import { publicApiFetch } from "@/lib/api";
import { getGuestToken, getStoredGuest, guestApiFetch } from "@/lib/guest-api";
import { STAY_TERMS, addDaysISO, formatMoney, nightsBetween, todayISO } from "@/lib/portal";

interface QuoteResult {
  reservation: { id: string; reservationNumber: string };
  quote: {
    reservationNumber: string;
    roomType: string;
    nightlyRate: string | number;
    nights?: number;
    total?: number;
    paymentMethod?: string;
    paymentInstructions?: {
      bankTransfer: { bankName: string | null; accountName: string | null; accountNumber: string | null; branch: string | null };
      ecocash: { number: string | null; merchant: string | null };
      onemoney: { number: string | null };
    };
  };
}

function BookForm() {
  const router = useRouter();
  const params = useSearchParams();
  const guest = getStoredGuest();
  const [checkIn, setCheckIn] = useState(params.get("checkIn") || todayISO());
  const [checkOut, setCheckOut] = useState(params.get("checkOut") || addDaysISO(todayISO(), 1));
  const [adults, setAdults] = useState(params.get("adults") || "2");
  const [children, setChildren] = useState(params.get("children") || "0");
  const [ratePlanId, setRatePlanId] = useState(params.get("ratePlanId") || "");
  const [roomName, setRoomName] = useState(params.get("name") || "Selected room");
  const [nightly, setNightly] = useState(0);
  const [description, setDescription] = useState("");
  const [firstName, setFirstName] = useState(guest?.firstName ?? "");
  const [lastName, setLastName] = useState(guest?.lastName ?? "");
  const [email, setEmail] = useState(guest?.email ?? "");
  const [phone, setPhone] = useState(guest?.phone ?? "");
  const [gender, setGender] = useState(guest?.gender ?? "");
  const [nationality, setNationality] = useState(guest?.nationality ?? "Zimbabwe");
  const [idPassport, setIdPassport] = useState(guest?.idPassport ?? "");
  const [company, setCompany] = useState(guest?.companyName ?? "");
  const [address, setAddress] = useState(guest?.address ?? "");
  const [payment, setPayment] = useState<"pay_on_arrival" | "bank_transfer">("pay_on_arrival");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuoteResult | null>(null);

  useEffect(() => {
    if (!ratePlanId) {
      router.replace("/browse");
      return;
    }
    publicApiFetch<{ rooms: { ratePlanId: string | null; name: string; description: string; nightlyRate: string }[] }>("/api/public/rooms")
      .then((d) => {
        const match = d.rooms.find((r) => r.ratePlanId === ratePlanId);
        if (match) {
          setRoomName(match.name);
          setDescription(match.description);
          setNightly(Number(match.nightlyRate));
        }
      })
      .catch(() => undefined);
  }, [ratePlanId, router]);

  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);
  const total = nightly * nights;

  async function placeBooking() {
    const errors: Record<string, string> = {};
    if (!firstName.trim()) errors.firstName = "Required";
    if (!lastName.trim()) errors.lastName = "Required";
    if (!email.trim()) errors.email = "Required";
    if (!phone.trim()) errors.phone = "Required";
    if (!nationality.trim()) errors.nationality = "Required";
    if (!idPassport.trim()) errors.idPassport = "National ID or passport is required";
    if (!terms) errors.terms = "Please accept the terms";
    setFieldError(errors);
    if (Object.keys(errors).length) return;

    setLoading(true);
    setError("");
    const payload = {
      firstName,
      lastName,
      email,
      phone,
      nationality,
      idPassport,
      gender: gender || undefined,
      companyName: company || undefined,
      address: address || undefined,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      adults: Number(adults),
      children: Number(children),
      ratePlanId,
      paymentMethod: payment,
    };
    try {
      const token = getGuestToken();
      const data = token
        ? await guestApiFetch<QuoteResult>("/api/guest/bookings", { method: "POST", body: JSON.stringify(payload) })
        : await publicApiFetch<QuoteResult>("/api/public/bookings", { method: "POST", body: JSON.stringify(payload) });
      setResult(data);
      if (token && data.reservation?.id) {
        router.push(`/my-bookings/${data.reservation.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setLoading(false);
    }
  }

  if (result && !getGuestToken()) {
    const pay = result.quote.paymentInstructions;
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-display font-bold mb-2">Booking confirmed</h1>
          <p className="text-muted-foreground mb-4">
            Your reservation number is <strong className="text-foreground">{result.reservation.reservationNumber}</strong>. Reception has been notified.
          </p>
          {result.quote.paymentMethod === "bank_transfer" && pay && (
            <div className="text-sm space-y-1 mb-4 p-3 rounded-md bg-muted/50">
              <p className="font-medium">Bank transfer details</p>
              <p>{pay.bankTransfer.bankName} · {pay.bankTransfer.accountName}</p>
              <p>Acc {pay.bankTransfer.accountNumber} · {pay.bankTransfer.branch}</p>
              <p>EcoCash {pay.ecocash.number} · Merchant {pay.ecocash.merchant}</p>
            </div>
          )}
          <p className="text-sm text-muted-foreground mb-4">Payment is settled at check-in unless you chose a bank transfer.</p>
          <div className="flex flex-wrap gap-3">
            <Link href={`/guest/login?next=/my-bookings`} className="msh-btn msh-btn-primary">Sign in to view bookings</Link>
            <Link href="/" className="msh-btn msh-btn-outline">Back home</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href="/browse" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        ← Back to rooms
      </Link>
      <h1 className="text-2xl font-display font-bold mb-6">Checkout</h1>
      {error && <div className="mb-4 bg-red-50 text-destructive text-sm px-4 py-3 rounded-md border border-red-200">{error}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-lg border bg-card shadow-sm">
            <div className="p-5">
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <IconUser className="h-5 w-5 text-primary" /> Guest Details
              </h2>
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First Name *" value={firstName} onChange={setFirstName} error={fieldError.firstName} />
                  <Field label="Last Name *" value={lastName} onChange={setLastName} error={fieldError.lastName} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Email *" type="email" value={email} onChange={setEmail} error={fieldError.email} disabled={Boolean(guest)} />
                  <Field label="Phone *" value={phone} onChange={setPhone} error={fieldError.phone} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Gender</label>
                    <select className="msh-input" value={gender} onChange={(e) => setGender(e.target.value)}>
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <Field label="Country" value={nationality} onChange={setNationality} error={fieldError.nationality} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="National ID / Passport" value={idPassport} onChange={setIdPassport} error={fieldError.idPassport} />
                  <Field label="Company" value={company} onChange={setCompany} />
                </div>
                <Field label="Address" value={address} onChange={setAddress} />
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-card shadow-sm">
            <div className="p-5">
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <IconBed className="h-5 w-5 text-primary" /> Stay Details
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5 flex items-center gap-1"><IconPeople /> Adults</label>
                  <input type="number" min={1} className="msh-input" value={adults} onChange={(e) => setAdults(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 flex items-center gap-1"><IconPeople /> Children</label>
                  <input type="number" min={0} className="msh-input" value={children} onChange={(e) => setChildren(e.target.value)} />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-card shadow-sm">
            <div className="p-5">
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">Payment</h2>
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 border rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
                  <input type="radio" name="payment" className="accent-primary" checked={payment === "pay_on_arrival"} onChange={() => setPayment("pay_on_arrival")} />
                  <div>
                    <p className="font-medium text-sm">Pay on Arrival</p>
                    <p className="text-xs text-muted-foreground">Settle your bill at check-in at the front desk.</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
                  <input type="radio" name="payment" className="accent-primary" checked={payment === "bank_transfer"} onChange={() => setPayment("bank_transfer")} />
                  <div>
                    <p className="font-medium text-sm">Bank Transfer</p>
                    <p className="text-xs text-muted-foreground">Transfer funds to our account. Details will be sent via email.</p>
                  </div>
                </label>
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-card shadow-sm">
            <div className="p-5">
              <h2 className="text-lg font-semibold mb-4">Terms & Conditions</h2>
              <div className="text-xs text-muted-foreground space-y-2 mb-4 max-h-32 overflow-y-auto border rounded-md p-3 bg-muted/30">
                {STAY_TERMS.map((line) => <p key={line}>{line}</p>)}
              </div>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="mt-0.5 accent-primary" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                I have read and agree to the terms and conditions of stay. *
              </label>
              {fieldError.terms && <p className="text-xs text-destructive mt-1">{fieldError.terms}</p>}
            </div>
          </section>
        </div>

        <aside>
          <div className="rounded-lg border bg-card shadow-sm sticky top-4">
            <div className="p-5">
              <h2 className="text-lg font-semibold mb-4">Booking Summary</h2>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium">{roomName}</p>
                  <p className="text-muted-foreground">{description}</p>
                </div>
                <hr className="border-border" />
                <Row label="Check-in" value={checkIn} />
                <Row label="Check-out" value={checkOut} />
                <Row label="Duration" value={`${nights} night${nights !== 1 ? "s" : ""}`} />
                <Row label="Guests" value={`${adults} adult${adults !== "1" ? "s" : ""}${Number(children) > 0 ? `, ${children} child${children !== "1" ? "ren" : ""}` : ""}`} />
                <hr className="border-border" />
                <Row label="Room Rate" value={`${formatMoney(nightly)} × ${nights}`} />
                <hr className="border-border" />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{formatMoney(total)}</span>
                </div>
              </div>
              <button type="button" className="msh-btn msh-btn-primary w-full mt-6 py-3" onClick={placeBooking} disabled={loading}>
                {loading ? "Processing..." : "Place Booking"}
              </button>
              <p className="text-[11px] text-muted-foreground text-center mt-2">
                Your booking will be confirmed instantly. Payment is settled at check-in.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", error, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; error?: string; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <input className={`msh-input ${disabled ? "bg-muted" : ""}`} type={type} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading…</div>}>
      <BookForm />
    </Suspense>
  );
}
