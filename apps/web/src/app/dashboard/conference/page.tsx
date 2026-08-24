"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Venue { id: string; name: string; halfDayRate: string; fullDayRate: string; maxCapacityBanquet: number }
interface Pkg { id: string; name: string; ratePerPax: string }
interface Resource { id: string; name: string; totalInventoryCount: number; dailyRentalRate: string }
interface Booking {
  id: string; bookingNumber: string; contactName: string; status: string;
  startTimestamp: string; endTimestamp: string; estimatedPax: number; totalAmount: string;
  venue: { name: string };
}

export default function ConferencePage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [form, setForm] = useState({ venueId: "", contactName: "", startTimestamp: "", endTimestamp: "", estimatedPax: 20, packageId: "" });

  function load() {
    apiFetch<{ items: Venue[] }>("/api/conference/venues").then((d) => setVenues(d.items));
    apiFetch<{ items: Pkg[] }>("/api/conference/packages").then((d) => setPackages(d.items));
    apiFetch<{ items: Resource[] }>("/api/conference/resources").then((d) => setResources(d.items));
    apiFetch<{ items: Booking[] }>("/api/conference/bookings").then((d) => setBookings(d.items));
  }
  useEffect(() => { load(); }, []);

  async function createBooking() {
    await apiFetch("/api/conference/bookings", { method: "POST", body: JSON.stringify({ ...form, estimatedPax: Number(form.estimatedPax), packageId: form.packageId || undefined }) });
    load();
  }
  async function confirm(id: string) {
    await apiFetch(`/api/conference/bookings/${id}/confirm`, { method: "PUT" });
    load();
  }

  const statusColor: Record<string, string> = { TENTATIVE: "bg-amber-100 text-amber-800", CONFIRMED: "bg-emerald-100 text-emerald-800", IN_PROGRESS: "bg-blue-100 text-blue-800" };

  return (
    <div className="p-6">
      <PageHeader title="Conference & Events" description="Venues, packages, resource allocation, and banquet run-sheets" />
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        {venues.map((v) => (
          <div key={v.id} className="msh-stat-card">
            <div className="font-semibold">{v.name}</div>
            <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Banquet {v.maxCapacityBanquet} · Half ${Number(v.halfDayRate).toFixed(0)} / Full ${Number(v.fullDayRate).toFixed(0)}</div>
          </div>
        ))}
      </div>
      <section className="msh-card p-4 mb-6">
        <h2 className="font-semibold mb-3">New booking</h2>
        <div className="grid md:grid-cols-3 gap-2">
          <select className="msh-input" value={form.venueId} onChange={(e) => setForm({ ...form, venueId: e.target.value })}>
            <option value="">Venue…</option>
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <input className="msh-input" placeholder="Contact name" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          <input className="msh-input" type="datetime-local" value={form.startTimestamp} onChange={(e) => setForm({ ...form, startTimestamp: e.target.value })} />
          <input className="msh-input" type="datetime-local" value={form.endTimestamp} onChange={(e) => setForm({ ...form, endTimestamp: e.target.value })} />
          <input className="msh-input" type="number" placeholder="Pax" value={form.estimatedPax} onChange={(e) => setForm({ ...form, estimatedPax: Number(e.target.value) })} />
          <select className="msh-input" value={form.packageId} onChange={(e) => setForm({ ...form, packageId: e.target.value })}>
            <option value="">No package</option>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.name} (${Number(p.ratePerPax)}/pax)</option>)}
          </select>
        </div>
        <button className="msh-btn msh-btn-primary mt-3" onClick={createBooking}>Create booking</button>
      </section>
      <section className="msh-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[hsl(var(--muted))] text-left text-[hsl(var(--muted-foreground))]">
            <tr><th className="p-3">Number</th><th className="p-3">Venue</th><th className="p-3">Contact</th><th className="p-3">When</th><th className="p-3">Total</th><th className="p-3">Status</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="p-3 font-mono text-xs">{b.bookingNumber}</td>
                <td className="p-3">{b.venue.name}</td>
                <td className="p-3">{b.contactName}</td>
                <td className="p-3 text-xs">{b.startTimestamp.slice(0, 16).replace("T", " ")}</td>
                <td className="p-3">${Number(b.totalAmount).toFixed(2)}</td>
                <td className="p-3"><span className={`msh-badge ${statusColor[b.status] ?? "bg-[hsl(var(--muted))]"}`}>{b.status}</span></td>
                <td className="p-3">{b.status === "TENTATIVE" && <button className="text-xs text-[hsl(var(--accent))]" onClick={() => confirm(b.id)}>Confirm</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-4">Resources: {resources.map((r) => `${r.name} (${r.totalInventoryCount})`).join(" · ")}</p>
    </div>
  );
}
