"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { getStoredUser } from "@/lib/api";

interface Ticket {
  id: string; ticketNumber: string; description: string; priority: string; status: string;
  room: { number: string } | null; asset: { name: string } | null;
}
interface Room { id: string; number: string }

export default function MaintenancePage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [form, setForm] = useState({ description: "", priority: "MEDIUM", roomId: "" });
  const user = getStoredUser();

  function load() {
    apiFetch<{ items: Ticket[] }>("/api/maintenance/tickets/pending").then((d) => setTickets(d.items));
    apiFetch<{ items: Room[] }>("/api/rooms").then((d) => setRooms(d.items));
  }
  useEffect(() => { load(); }, []);

  async function create() {
    await apiFetch("/api/maintenance/tickets", { method: "POST", body: JSON.stringify({ ...form, roomId: form.roomId || undefined }) });
    setForm({ ...form, description: "" });
    load();
  }
  async function dispatch(ticketId: string) {
    if (!user) return;
    await apiFetch("/api/maintenance/work-orders", {
      method: "POST",
      body: JSON.stringify({ ticketId, technicianUserId: user.id, scheduledDate: new Date().toISOString().slice(0, 10) }),
    });
    load();
  }

  const pri: Record<string, string> = { EMERGENCY: "bg-red-100 text-red-800", HIGH: "bg-orange-100 text-orange-800", MEDIUM: "bg-amber-100 text-amber-800", LOW: "bg-slate-100 text-slate-600" };

  return (
    <div className="p-6">
      <PageHeader title="Maintenance & Assets" description="Defect tickets, work orders, and out-of-order room holds" />
      <section className="msh-card p-4 mb-6">
        <h2 className="font-semibold mb-3">Log ticket</h2>
        <div className="grid md:grid-cols-4 gap-2">
          <input className="msh-input md:col-span-2" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <select className="msh-input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {["LOW", "MEDIUM", "HIGH", "EMERGENCY"].map((p) => <option key={p}>{p}</option>)}
          </select>
          <select className="msh-input" value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>
            <option value="">No room</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>Room {r.number}</option>)}
          </select>
        </div>
        <button className="msh-btn msh-btn-primary mt-3" onClick={create}>Create ticket</button>
      </section>
      <section className="msh-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[hsl(var(--muted))] text-left text-[hsl(var(--muted-foreground))]">
            <tr><th className="p-3">Ticket</th><th className="p-3">Issue</th><th className="p-3">Room</th><th className="p-3">Priority</th><th className="p-3">Status</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-3 font-mono text-xs">{t.ticketNumber}</td>
                <td className="p-3">{t.description}</td>
                <td className="p-3">{t.room?.number ?? "—"}</td>
                <td className="p-3"><span className={`msh-badge ${pri[t.priority]}`}>{t.priority}</span></td>
                <td className="p-3">{t.status}</td>
                <td className="p-3">{t.status === "OPEN" && <button className="text-xs text-[hsl(var(--accent))]" onClick={() => dispatch(t.id)}>Dispatch</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
