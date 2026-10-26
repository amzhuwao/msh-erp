"use client";

import { useEffect, useState } from "react";
import { apiFetch, getStoredUser } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Venue {
  id: string; name: string; locationDescription: string | null; halfDayRate: string; fullDayRate: string;
  maxCapacityChairsOnly: number; maxCapacityTracers: number; maxCapacityRoundTables: number; isActive: boolean;
  _count?: { bookings: number };
}
interface VenueForm {
  name: string; locationDescription: string; maxCapacityChairsOnly: string; maxCapacityTracers: string;
  maxCapacityRoundTables: string; halfDayRate: string; fullDayRate: string; isActive: boolean;
}
interface Pkg { id: string; name: string; ratePerPax: string; venueId: string }
interface Resource { id: string; name: string; totalInventoryCount: number; dailyRentalRate: string }
interface InHouseReservation { id: string; reservationNumber: string; guest: { firstName: string; lastName: string }; room: { number: string } | null }
interface Booking {
  id: string; bookingNumber: string; contactName: string; status: string;
  startTimestamp: string; endTimestamp: string; estimatedPax: number; actualPax: number | null;
  setupStyle: string; baseVenueCost: string; depositRequired: string; depositPaid: string; totalAmount: string;
  venue: { name: string };
  package: { name: string; ratePerPax: string } | null;
  company: { companyName: string } | null;
  reservation: InHouseReservation | null;
  resources: { id: string; quantityAllocated: number; chargedRate: string; subtotal: string; resource: { name: string } }[];
  folioChargeLine: { id: string; amount: string } | null;
}

type BookingView = "reserved" | "past" | "all";

function openConferenceProforma(bookingId: string) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  window.open(`${base}/dashboard/documents/${bookingId}?type=proforma&source=conference`, "_blank");
}

export default function ConferencePage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingView, setBookingView] = useState<BookingView>("reserved");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [reservations, setReservations] = useState<InHouseReservation[]>([]);
  const [venueEditing, setVenueEditing] = useState<Venue | "new" | null>(null);
  const [venueSelected, setVenueSelected] = useState<Venue | null>(null);
  const [venueForm, setVenueForm] = useState<VenueForm>({ name: "", locationDescription: "", maxCapacityChairsOnly: "20", maxCapacityTracers: "20", maxCapacityRoundTables: "20", halfDayRate: "0", fullDayRate: "0", isActive: true });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savingVenue, setSavingVenue] = useState(false);
  const [venueActions, setVenueActions] = useState({ create: false, edit: false, remove: false });
  const [form, setForm] = useState({ venueId: "", contactName: "", startTimestamp: "", endTimestamp: "", estimatedPax: 20, customVenueRate: "", packageId: "", reservationId: "" });

  async function load() {
    const [venueResult, resourceResult, bookingResult, reservationResult] = await Promise.all([
      apiFetch<{ items: Venue[] }>("/api/conference/venues"),
      apiFetch<{ items: Resource[] }>("/api/conference/resources"),
      apiFetch<{ items: Booking[] }>("/api/conference/bookings"),
      apiFetch<{ items: InHouseReservation[] }>("/api/conference/in-house-reservations"),
    ]);
    setVenues(venueResult.items); setResources(resourceResult.items);
    setBookings(bookingResult.items); setReservations(reservationResult.items);
  }
  useEffect(() => {
    const permissions = getStoredUser()?.permissions.Conference ?? [];
    setVenueActions({ create: permissions.includes("CREATE"), edit: permissions.includes("EDIT"), remove: permissions.includes("DELETE") });
    void load().catch((err) => setError(err instanceof Error ? err.message : "Could not load conference data"));
  }, []);

  function startNewVenue() {
    setVenueEditing("new"); setVenueSelected(null); setMessage(""); setError("");
    setVenueForm({ name: "", locationDescription: "", maxCapacityChairsOnly: "20", maxCapacityTracers: "20", maxCapacityRoundTables: "20", halfDayRate: "0", fullDayRate: "0", isActive: true });
  }

  function editVenue(venue: Venue) {
    setVenueEditing(venue); setVenueSelected(null); setMessage(""); setError("");
    setVenueForm({ name: venue.name, locationDescription: venue.locationDescription ?? "", maxCapacityChairsOnly: String(venue.maxCapacityChairsOnly), maxCapacityTracers: String(venue.maxCapacityTracers), maxCapacityRoundTables: String(venue.maxCapacityRoundTables), halfDayRate: String(Number(venue.halfDayRate)), fullDayRate: String(Number(venue.fullDayRate)), isActive: venue.isActive });
  }

  async function viewVenue(id: string) {
    try { setVenueSelected(await apiFetch<Venue>(`/api/conference/venues/${id}`)); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load venue details"); }
  }

  async function saveVenue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSavingVenue(true); setError(""); setMessage("");
    const payload = {
      name: venueForm.name,
      locationDescription: venueForm.locationDescription || null,
      maxCapacityChairsOnly: Number(venueForm.maxCapacityChairsOnly),
      maxCapacityTracers: Number(venueForm.maxCapacityTracers),
      maxCapacityRoundTables: Number(venueForm.maxCapacityRoundTables),
      halfDayRate: Number(venueForm.halfDayRate),
      fullDayRate: Number(venueForm.fullDayRate),
      ...(venueEditing !== "new" ? { isActive: venueForm.isActive } : {}),
    };
    try {
      await apiFetch(venueEditing === "new" ? "/api/conference/venues" : `/api/conference/venues/${venueEditing!.id}`, {
        method: venueEditing === "new" ? "POST" : "PUT", body: JSON.stringify(payload),
      });
      setMessage(venueEditing === "new" ? "Venue created." : "Venue updated."); setVenueEditing(null);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save venue"); }
    finally { setSavingVenue(false); }
  }

  async function removeVenue(venue: Venue) {
    if (!confirm(`Remove ${venue.name}? If it has bookings, it will be archived so the booking history is kept.`)) return;
    try {
      const result = await apiFetch<{ message: string }>(`/api/conference/venues/${venue.id}`, { method: "DELETE" });
      setMessage(result.message); setError(""); setVenueSelected(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not remove venue"); }
  }

  async function selectBookingVenue(venueId: string) {
    setForm((current) => ({ ...current, venueId, packageId: "" }));
    setPackages([]);
    if (!venueId) return;
    try {
      const result = await apiFetch<{ items: Pkg[] }>(`/api/conference/packages?venueId=${encodeURIComponent(venueId)}`);
      setPackages(result.items);
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load packages for this venue"); }
  }

  async function createBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await apiFetch("/api/conference/bookings", { method: "POST", body: JSON.stringify({
        venueId: form.venueId,
        contactName: form.contactName,
        startTimestamp: form.startTimestamp,
        endTimestamp: form.endTimestamp,
        estimatedPax: Number(form.estimatedPax),
        customVenueRate: form.customVenueRate.trim() ? Number(form.customVenueRate) : undefined,
        packageId: form.packageId || undefined,
        reservationId: form.reservationId || undefined,
      }) });
      setMessage("Conference booking created."); setError(""); await load();
      setForm({ venueId: "", contactName: "", startTimestamp: "", endTimestamp: "", estimatedPax: 20, customVenueRate: "", packageId: "", reservationId: "" });
      setPackages([]);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create conference booking"); }
  }
  async function confirm(id: string) {
    try { await apiFetch(`/api/conference/bookings/${id}/confirm`, { method: "PUT" }); setMessage("Booking confirmed."); setError(""); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not confirm booking"); }
  }
  async function complete(id: string) {
    try { await apiFetch(`/api/conference/bookings/${id}/complete`, { method: "POST" }); setMessage("Event completed and billed."); setError(""); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not complete event"); }
  }

  const selectedVenue = venues.find((venue) => venue.id === form.venueId);
  const bookingDurationHours = form.startTimestamp && form.endTimestamp
    ? (new Date(form.endTimestamp).getTime() - new Date(form.startTimestamp).getTime()) / 3_600_000
    : null;
  const standardVenueRate = selectedVenue && bookingDurationHours !== null && bookingDurationHours > 0
    ? Number(bookingDurationHours <= 5 ? selectedVenue.halfDayRate : selectedVenue.fullDayRate)
    : null;
  const statusColor: Record<string, string> = { TENTATIVE: "bg-amber-100 text-amber-800", CONFIRMED: "bg-emerald-100 text-emerald-800", IN_PROGRESS: "bg-blue-100 text-blue-800", COMPLETED: "bg-slate-100 text-slate-800" };
  const now = Date.now();
  const visibleBookings = bookings.filter((booking) => {
    const past = booking.status === "COMPLETED" || new Date(booking.endTimestamp).getTime() < now;
    if (bookingView === "past") return past;
    if (bookingView === "reserved") return !past && booking.status !== "CANCELLED";
    return true;
  });
  const reservedCount = bookings.filter((booking) => booking.status !== "COMPLETED" && booking.status !== "CANCELLED" && new Date(booking.endTimestamp).getTime() >= now).length;
  const pastCount = bookings.filter((booking) => booking.status === "COMPLETED" || new Date(booking.endTimestamp).getTime() < now).length;

  function formatBookingDateTime(value: string) {
    return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  }

  return (
    <div className="p-6">
      <PageHeader title="Conference & Events" description="Venues, packages, resource allocation, and banquet run-sheets" />
      {(error || message) && <div role={error ? "alert" : "status"} className={`rounded-lg border p-3 mb-4 text-sm ${error ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>{error || message}</div>}
      <section className="msh-card p-4 mb-6 space-y-4">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">Conference venues</h2><p className="text-sm text-slate-500">Manage venue details, capacities, rates, and availability.</p></div>{venueActions.create && <button type="button" className="msh-btn msh-btn-primary" onClick={startNewVenue}>Add venue</button>}</div>
        {venueEditing && <form onSubmit={(event) => void saveVenue(event)} className="rounded-lg border p-4 space-y-3">
          <h3 className="font-semibold">{venueEditing === "new" ? "Create venue" : `Edit ${venueEditing.name}`}</h3>
          <div className="grid md:grid-cols-3 gap-3">
            <label className="block text-sm">Venue name *<input required className="msh-input mt-1" value={venueForm.name} onChange={(event) => setVenueForm({ ...venueForm, name: event.target.value })} /></label>
            <label className="block text-sm md:col-span-2">Location / description<input className="msh-input mt-1" value={venueForm.locationDescription} onChange={(event) => setVenueForm({ ...venueForm, locationDescription: event.target.value })} /></label>
            <label className="block text-sm">Chairs Only capacity *<input required min="1" type="number" className="msh-input mt-1" value={venueForm.maxCapacityChairsOnly} onChange={(event) => setVenueForm({ ...venueForm, maxCapacityChairsOnly: event.target.value })} /></label>
            <label className="block text-sm">Tracers capacity *<input required min="1" type="number" className="msh-input mt-1" value={venueForm.maxCapacityTracers} onChange={(event) => setVenueForm({ ...venueForm, maxCapacityTracers: event.target.value })} /></label>
            <label className="block text-sm">Round Tables capacity *<input required min="1" type="number" className="msh-input mt-1" value={venueForm.maxCapacityRoundTables} onChange={(event) => setVenueForm({ ...venueForm, maxCapacityRoundTables: event.target.value })} /></label>
            <label className="block text-sm">Half-day rate *<input required min="0" step="0.01" type="number" className="msh-input mt-1" value={venueForm.halfDayRate} onChange={(event) => setVenueForm({ ...venueForm, halfDayRate: event.target.value })} /></label>
            <label className="block text-sm">Full-day rate *<input required min="0" step="0.01" type="number" className="msh-input mt-1" value={venueForm.fullDayRate} onChange={(event) => setVenueForm({ ...venueForm, fullDayRate: event.target.value })} /></label>
            {venueEditing !== "new" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={venueForm.isActive} onChange={(event) => setVenueForm({ ...venueForm, isActive: event.target.checked })} /> Active and available for new bookings</label>}
          </div>
          <div className="flex gap-2"><button className="msh-btn msh-btn-primary" type="submit" disabled={savingVenue}>{savingVenue ? "Saving…" : "Save venue"}</button><button className="msh-btn msh-btn-outline" type="button" onClick={() => setVenueEditing(null)}>Cancel</button></div>
        </form>}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {venues.map((venue) => <article key={venue.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{venue.name}</h3><span className={`msh-badge ${venue.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{venue.isActive ? "Active" : "Archived"}</span></div>
            <p className="mt-1 text-sm text-slate-500">{venue.locationDescription || "No location description"}</p>
            <p className="mt-3 text-xs">Chairs Only {venue.maxCapacityChairsOnly} · Tracers {venue.maxCapacityTracers} · Round Tables {venue.maxCapacityRoundTables}</p>
            <p className="text-xs text-slate-600">Half day ${Number(venue.halfDayRate).toFixed(2)} · Full day ${Number(venue.fullDayRate).toFixed(2)}</p>
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="msh-btn msh-btn-outline text-xs" onClick={() => void viewVenue(venue.id)}>View</button>{venueActions.edit && <button type="button" className="msh-btn msh-btn-outline text-xs" onClick={() => editVenue(venue)}>Edit</button>}{venueActions.remove && <button type="button" className="msh-btn msh-btn-outline text-xs text-red-700" onClick={() => void removeVenue(venue)}>Delete / archive</button>}</div>
          </article>)}
          {venues.length === 0 && <p className="text-sm text-slate-500">No conference venues configured.</p>}
        </div>
        {venueSelected && <div className="rounded-lg bg-slate-50 p-4 text-sm"><div className="flex justify-between"><h3 className="font-semibold">{venueSelected.name} details</h3><button type="button" className="text-slate-500" onClick={() => setVenueSelected(null)}>Close</button></div><p>{venueSelected.locationDescription || "No location description"}</p><p className="mt-1">{venueSelected._count?.bookings ?? 0} linked booking(s)</p></div>}
      </section>
      <section className="msh-card p-4 mb-6">
        <h2 className="font-semibold mb-3">New booking</h2>
        <form onSubmit={(event) => void createBooking(event)} className="space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            <label className="block text-sm">Venue *
              <select required className="msh-input mt-1" value={form.venueId} onChange={(e) => void selectBookingVenue(e.target.value)}>
                <option value="">Select an active venue</option>
                {venues.filter((v) => v.isActive).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">Contact name *
              <input required className="msh-input mt-1" autoComplete="name" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            </label>
            <label className="block text-sm">Expected attendees *
              <input required min="1" step="1" className="msh-input mt-1" type="number" value={form.estimatedPax} onChange={(e) => setForm({ ...form, estimatedPax: Number(e.target.value) })} />
            </label>
            <label className="block text-sm">Start date and time *
              <input required className="msh-input mt-1" type="datetime-local" value={form.startTimestamp} onChange={(e) => setForm({ ...form, startTimestamp: e.target.value })} />
            </label>
            <label className="block text-sm">End date and time *
              <input required className="msh-input mt-1" type="datetime-local" min={form.startTimestamp || undefined} value={form.endTimestamp} onChange={(e) => setForm({ ...form, endTimestamp: e.target.value })} />
            </label>
            <label className="block text-sm">Package (optional)
              <select className="msh-input mt-1" value={form.packageId} onChange={(e) => setForm({ ...form, packageId: e.target.value })}>
                <option value="">{form.venueId ? (packages.length ? "No package" : "No packages assigned to this venue") : "Choose a venue first"}</option>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.name} (${Number(p.ratePerPax)}/person)</option>)}
              </select>
              {form.venueId && packages.length === 0 && <span className="mt-1 block text-xs text-slate-500">Assign packages to this venue in Catalog → Conference.</span>}
            </label>
            <label className="block text-sm">Custom venue rate (optional, USD)
              <input min="0" step="0.01" className="msh-input mt-1" type="number" inputMode="decimal" placeholder="Use venue's standard rate" value={form.customVenueRate} onChange={(e) => setForm({ ...form, customVenueRate: e.target.value })} />
              <span className="mt-1 block text-xs text-slate-500">{standardVenueRate === null ? "Leave blank to use the venue’s standard half-day or full-day rate." : `Standard venue rate for this duration: $${standardVenueRate.toFixed(2)}.`} A custom amount replaces the venue charge; package charges are added separately.</span>
            </label>
            <label className="block text-sm md:col-span-2">Link an in-house guest for folio billing (optional)
              <select className="msh-input mt-1" value={form.reservationId} onChange={(e) => setForm({ ...form, reservationId: e.target.value })}>
                <option value="">No guest linked</option>
                {reservations.map((r) => <option key={r.id} value={r.id}>{r.room?.number ?? "No room"} · {r.guest.firstName} {r.guest.lastName} · {r.reservationNumber}</option>)}
              </select>
            </label>
          </div>
          <button className="msh-btn msh-btn-primary" type="submit">Create booking</button>
        </form>
      </section>
      <section className="msh-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-semibold">Conference bookings</h2>
            <p className="text-xs text-slate-500">Browse reserved events and review completed conference details.</p>
          </div>
          <div className="flex gap-1 rounded-lg bg-[hsl(var(--muted))] p-1" role="tablist" aria-label="Conference booking view">
            {([
              ["reserved", `Reserved (${reservedCount})`],
              ["past", `Past (${pastCount})`],
              ["all", "All bookings"],
            ] as [BookingView, string][]).map(([view, label]) => (
              <button key={view} type="button" role="tab" aria-selected={bookingView === view} className={`rounded-md px-3 py-1.5 text-xs ${bookingView === view ? "bg-white font-medium shadow-sm" : "text-slate-600"}`} onClick={() => setBookingView(view)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[hsl(var(--muted))] text-left text-[hsl(var(--muted-foreground))]">
              <tr><th className="p-3">Number</th><th className="p-3">Venue</th><th className="p-3">Contact</th><th className="p-3">Guest / room</th><th className="p-3">When</th><th className="p-3">Total</th><th className="p-3">Status</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {visibleBookings.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="p-3 font-mono text-xs">{b.bookingNumber}</td>
                  <td className="p-3">{b.venue.name}</td>
                  <td className="p-3">{b.contactName}</td>
                  <td className="p-3">{b.reservation ? `${b.reservation.guest.firstName} ${b.reservation.guest.lastName} · ${b.reservation.room?.number ?? "—"}` : "Not linked"}</td>
                  <td className="p-3 text-xs">{formatBookingDateTime(b.startTimestamp)}</td>
                  <td className="p-3">${Number(b.totalAmount).toFixed(2)}</td>
                  <td className="p-3"><span className={`msh-badge ${statusColor[b.status] ?? "bg-[hsl(var(--muted))]"}`}>{b.status}</span></td>
                  <td className="p-3"><div className="flex flex-wrap gap-2"><button type="button" className="text-xs text-[hsl(var(--accent))]" onClick={() => setSelectedBooking(b)}>View details</button>{["TENTATIVE", "CONFIRMED", "IN_PROGRESS"].includes(b.status) && <button type="button" className="text-xs text-[hsl(var(--accent))]" onClick={() => openConferenceProforma(b.id)}>Pro forma</button>}{b.status === "TENTATIVE" && <button className="text-xs text-[hsl(var(--accent))]" onClick={() => confirm(b.id)}>Confirm</button>}{["CONFIRMED", "IN_PROGRESS"].includes(b.status) && <button className="text-xs text-[hsl(var(--accent))]" onClick={() => complete(b.id)}>Complete & bill</button>}{b.folioChargeLine && <span className="text-xs text-emerald-700">Billed to folio</span>}</div></td>
                </tr>
              ))}
              {visibleBookings.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-sm text-slate-500">{bookingView === "past" ? "No past conference bookings found." : bookingView === "reserved" ? "No reserved or upcoming conference bookings found." : "No conference bookings found."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedBooking(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="conference-booking-details-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b pb-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Conference booking</p>
                <h2 id="conference-booking-details-title" className="text-xl font-semibold">{selectedBooking.bookingNumber}</h2>
                <p className="mt-1 text-sm text-slate-600">{selectedBooking.venue.name} · {formatBookingDateTime(selectedBooking.startTimestamp)}</p>
              </div>
              <button type="button" className="msh-btn msh-btn-outline text-xs" onClick={() => setSelectedBooking(null)}>Close</button>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
              <div className="space-y-2">
                <h3 className="font-semibold">Event</h3>
                <p><span className="text-slate-500">End:</span> {formatBookingDateTime(selectedBooking.endTimestamp)}</p>
                <p><span className="text-slate-500">Status:</span> {selectedBooking.status}</p>
                <p><span className="text-slate-500">Setup:</span> {selectedBooking.setupStyle}</p>
                <p><span className="text-slate-500">Attendees:</span> {selectedBooking.actualPax ?? selectedBooking.estimatedPax}{selectedBooking.actualPax === null ? " estimated" : " actual"}</p>
                <p><span className="text-slate-500">Contact:</span> {selectedBooking.contactName}</p>
                {selectedBooking.company && <p><span className="text-slate-500">Organisation:</span> {selectedBooking.company.companyName}</p>}
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">Charges & payment</h3>
                <p><span className="text-slate-500">Venue charge:</span> ${Number(selectedBooking.baseVenueCost).toFixed(2)}</p>
                {selectedBooking.package && <p><span className="text-slate-500">Package:</span> {selectedBooking.package.name} · ${Number(selectedBooking.package.ratePerPax).toFixed(2)} / person</p>}
                <p><span className="text-slate-500">Deposit required:</span> ${Number(selectedBooking.depositRequired).toFixed(2)}</p>
                <p><span className="text-slate-500">Deposit paid:</span> ${Number(selectedBooking.depositPaid).toFixed(2)}</p>
                <p className="font-semibold"><span className="text-slate-500">Total:</span> ${Number(selectedBooking.totalAmount).toFixed(2)}</p>
                {selectedBooking.folioChargeLine && <p className="text-emerald-700">Billed to guest folio · ${Number(selectedBooking.folioChargeLine.amount).toFixed(2)}</p>}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <h3 className="font-semibold">Allocated resources</h3>
                {selectedBooking.resources.length ? <ul className="divide-y rounded-lg border px-3">{selectedBooking.resources.map((allocation) => <li key={allocation.id} className="flex justify-between gap-3 py-2"><span>{allocation.resource.name} × {allocation.quantityAllocated}</span><span>${Number(allocation.subtotal).toFixed(2)}</span></li>)}</ul> : <p className="text-slate-500">No equipment or resources allocated.</p>}
                <h3 className="pt-2 font-semibold">Linked guest</h3>
                {selectedBooking.reservation ? <p>{selectedBooking.reservation.guest.firstName} {selectedBooking.reservation.guest.lastName} · Room {selectedBooking.reservation.room?.number ?? "not assigned"} · {selectedBooking.reservation.reservationNumber}</p> : <p className="text-slate-500">No in-house guest linked.</p>}
              </div>
            </div>
          </section>
        </div>
      )}
      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-4">Resources: {resources.map((r) => `${r.name} (${r.totalInventoryCount})`).join(" · ")}</p>
    </div>
  );
}
