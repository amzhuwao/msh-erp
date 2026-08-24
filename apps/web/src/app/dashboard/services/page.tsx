"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Order {
  id: string; serviceNumber: string; serviceType: string; status: string; totalCharge: string;
  reservation: { guest: { firstName: string; lastName: string }; room: { number: string } | null };
}
interface Stay { id: string; guest: { firstName: string; lastName: string }; room: { number: string } | null }
interface CatalogItem { id: string; name: string; category: string; price: string; mealPeriod: string | null }

const typeMap: Record<string, string> = {
  LAUNDRY: "LAUNDRY", TRANSIT: "TRANSIT", CONCIERGE: "CONCIERGE", MEAL: "ROOM_SERVICE", OTHERS: "OTHERS",
};

export default function GuestServicesPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [form, setForm] = useState({ reservationId: "", serviceType: "LAUNDRY", catalogItemId: "", totalCharge: 15, specialInstructions: "" });

  function load() {
    apiFetch<{ items: Order[] }>("/api/services/active-requests").then((d) => setOrders(d.items));
    apiFetch<{ items: CatalogItem[] }>("/api/services/catalog").then((d) => setCatalog(d.items)).catch(() => setCatalog([]));
    apiFetch<{ items: Stay[] }>("/api/front-office/in-house").then((d) => setStays(d.items)).catch(() => {
      apiFetch<{ items: Stay[] }>("/api/reservations?status=CHECKED_IN").then((d) => setStays(d.items)).catch(() => setStays([]));
    });
  }
  useEffect(() => { load(); }, []);

  async function create() {
    await apiFetch("/api/services/orders", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        catalogItemId: form.catalogItemId || undefined,
        totalCharge: Number(form.totalCharge),
      }),
    });
    load();
  }
  async function complete(id: string) {
    await apiFetch(`/api/services/orders/${id}/status`, { method: "PUT", body: JSON.stringify({ status: "COMPLETED" }) });
    load();
  }

  const colors: Record<string, string> = { LAUNDRY: "bg-blue-100 text-blue-800", ROOM_SERVICE: "bg-red-100 text-red-800", TRANSIT: "bg-emerald-100 text-emerald-800", CONCIERGE: "bg-violet-100 text-violet-800" };

  return (
    <div className="p-6">
      <PageHeader title="Guest Services" description="Meals, laundry, transit, concierge — charges post to folio on completion" />
      <section className="msh-card p-4 mb-6">
        <h2 className="font-semibold mb-3">Log service</h2>
        <div className="grid md:grid-cols-5 gap-2">
          <select className="msh-input" value={form.reservationId} onChange={(e) => setForm({ ...form, reservationId: e.target.value })}>
            <option value="">In-house guest…</option>
            {stays.map((s) => <option key={s.id} value={s.id}>{s.guest.firstName} {s.guest.lastName} {s.room ? `· ${s.room.number}` : ""}</option>)}
          </select>
          <select className="msh-input" value={form.catalogItemId} onChange={(e) => {
            const item = catalog.find((c) => c.id === e.target.value);
            setForm({
              ...form,
              catalogItemId: e.target.value,
              totalCharge: item ? Number(item.price) : form.totalCharge,
              serviceType: item ? (typeMap[item.category] ?? "OTHERS") : form.serviceType,
            });
          }}>
            <option value="">Catalog item…</option>
            {catalog.map((c) => <option key={c.id} value={c.id}>{c.name} · ${Number(c.price).toFixed(2)}{c.mealPeriod ? ` · ${c.mealPeriod}` : ""}</option>)}
          </select>
          <select className="msh-input" value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })}>
            {["LAUNDRY", "ROOM_SERVICE", "TRANSIT", "CONCIERGE", "OTHERS"].map((t) => <option key={t}>{t}</option>)}
          </select>
          <input className="msh-input" type="number" value={form.totalCharge} onChange={(e) => setForm({ ...form, totalCharge: Number(e.target.value) })} />
          <button className="msh-btn msh-btn-primary" onClick={create}>Create</button>
        </div>
      </section>
      <section className="msh-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[hsl(var(--muted))] text-left text-[hsl(var(--muted-foreground))]">
            <tr><th className="p-3">Number</th><th className="p-3">Guest</th><th className="p-3">Type</th><th className="p-3">Charge</th><th className="p-3">Status</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="p-3 font-mono text-xs">{o.serviceNumber}</td>
                <td className="p-3">{o.reservation.guest.firstName} {o.reservation.guest.lastName}</td>
                <td className="p-3"><span className={`msh-badge ${colors[o.serviceType] ?? ""}`}>{o.serviceType}</span></td>
                <td className="p-3">${Number(o.totalCharge).toFixed(2)}</td>
                <td className="p-3">{o.status}</td>
                <td className="p-3">{o.status !== "COMPLETED" && <button className="text-xs text-[hsl(var(--accent))]" onClick={() => complete(o.id)}>Complete</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
