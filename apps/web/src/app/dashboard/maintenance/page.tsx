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
interface StockItem { id: string; itemCode: string; name: string; baseUnitOfMeasure: string }
interface Store { id: string; locationName: string }
interface Asset { id: string; assetCode: string; name: string; category: string; currentValue: string; locationDescription: string | null; isActive: boolean; preventivePlans?: { id: string; planName: string; nextDueDate: string }[] }
interface Technician { id: string; fullName: string }
interface PreventivePlan { id: string; planName: string; description: string; intervalDays: number; nextDueDate: string; asset: Asset; assignedTechnician: Technician | null }
interface WorkOrder { id: string; woNumber: string; status: string; scheduledDate: string; partsCost: string; ticket: { description: string; room: { number: string } | null }; parts: { id: string; quantityUsed: string; item: { name: string } }[] }

export default function MaintenancePage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [plans, setPlans] = useState<PreventivePlan[]>([]);
  const [partForm, setPartForm] = useState({ itemId: "", storeLocationId: "", quantityUsed: 1 });
  const [form, setForm] = useState({ description: "", priority: "MEDIUM", roomId: "", assetId: "" });
  const [assetForm, setAssetForm] = useState({ assetCode: "", name: "", category: "", purchaseDate: new Date().toISOString().slice(0, 10), purchaseCost: "", currentValue: "", depreciationRate: "", locationDescription: "" });
  const [planForm, setPlanForm] = useState({ planName: "", description: "", assetId: "", intervalDays: "90", nextDueDate: new Date().toISOString().slice(0, 10), assignedTechnicianId: "" });
  const [user, setUser] = useState(getStoredUser());

  function load() {
    apiFetch<{ items: Ticket[] }>("/api/maintenance/tickets/pending").then((d) => setTickets(d.items));
    apiFetch<{ items: Room[] }>("/api/rooms").then((d) => setRooms(d.items));
    apiFetch<{ items: WorkOrder[] }>("/api/maintenance/work-orders/mine").then((d) => setWorkOrders(d.items));
    apiFetch<{ items: StockItem[] }>("/api/inventory/items").then((d) => setItems(d.items));
    apiFetch<{ items: Store[] }>("/api/inventory/locations").then((d) => setStores(d.items));
    apiFetch<{ items: Asset[] }>("/api/maintenance/assets").then((d) => setAssets(d.items));
    apiFetch<{ items: Technician[] }>("/api/maintenance/technicians").then((d) => setTechnicians(d.items));
    apiFetch<{ items: PreventivePlan[] }>("/api/maintenance/preventive-plans").then((d) => setPlans(d.items));
  }
  useEffect(() => { setUser(getStoredUser()); load(); }, []);

  async function createAsset() {
    await apiFetch("/api/maintenance/assets", { method: "POST", body: JSON.stringify({ ...assetForm, purchaseCost: Number(assetForm.purchaseCost), currentValue: Number(assetForm.currentValue), depreciationRate: assetForm.depreciationRate ? Number(assetForm.depreciationRate) : undefined }) });
    setAssetForm({ assetCode: "", name: "", category: "", purchaseDate: new Date().toISOString().slice(0, 10), purchaseCost: "", currentValue: "", depreciationRate: "", locationDescription: "" });
    load();
  }

  async function createPlan() {
    await apiFetch("/api/maintenance/preventive-plans", { method: "POST", body: JSON.stringify({ ...planForm, intervalDays: Number(planForm.intervalDays) }) });
    setPlanForm({ ...planForm, planName: "", description: "" });
    load();
  }

  async function setAssetStatus(asset: Asset) {
    await apiFetch(`/api/maintenance/assets/${asset.id}/status`, { method: "PUT", body: JSON.stringify({ isActive: !asset.isActive }) });
    load();
  }

  async function generateDuePlans() {
    const result = await apiFetch<{ count: number }>("/api/maintenance/preventive-plans/generate-due", { method: "POST" });
    window.alert(`${result.count} preventive work order${result.count === 1 ? "" : "s"} created.`);
    load();
  }

  async function create() {
    await apiFetch("/api/maintenance/tickets", { method: "POST", body: JSON.stringify({ ...form, roomId: form.roomId || undefined, assetId: form.assetId || undefined }) });
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
  async function start(id: string) {
    await apiFetch(`/api/maintenance/work-orders/${id}/start`, { method: "PUT" });
    load();
  }
  async function issuePart(workOrderId: string) {
    await apiFetch(`/api/maintenance/work-orders/${workOrderId}/parts`, { method: "POST", body: JSON.stringify({ ...partForm, quantityUsed: Number(partForm.quantityUsed) }) });
    load();
  }
  async function complete(id: string) {
    await apiFetch(`/api/maintenance/work-orders/${id}/complete`, { method: "PUT", body: JSON.stringify({ notes: "Repair completed" }) });
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
          <select className="msh-input" value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })}><option value="">No asset</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.assetCode} · {asset.name}</option>)}</select>
        </div>
        <button className="msh-btn msh-btn-primary mt-3" onClick={create}>Create ticket</button>
      </section>
      <section className="msh-card p-4 mb-6">
        <h2 className="font-semibold mb-3">Asset register</h2>
        <div className="grid md:grid-cols-4 gap-2">
          <input className="msh-input" placeholder="Asset code" value={assetForm.assetCode} onChange={(e) => setAssetForm({ ...assetForm, assetCode: e.target.value })} />
          <input className="msh-input" placeholder="Asset name" value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} />
          <input className="msh-input" placeholder="Category" value={assetForm.category} onChange={(e) => setAssetForm({ ...assetForm, category: e.target.value })} />
          <input className="msh-input" placeholder="Location" value={assetForm.locationDescription} onChange={(e) => setAssetForm({ ...assetForm, locationDescription: e.target.value })} />
          <label className="text-xs">Purchase date<input className="msh-input mt-1" type="date" value={assetForm.purchaseDate} onChange={(e) => setAssetForm({ ...assetForm, purchaseDate: e.target.value })} /></label>
          <label className="text-xs">Purchase cost<input className="msh-input mt-1" type="number" min="0" step="0.01" value={assetForm.purchaseCost} onChange={(e) => setAssetForm({ ...assetForm, purchaseCost: e.target.value })} /></label>
          <label className="text-xs">Current value<input className="msh-input mt-1" type="number" min="0" step="0.01" value={assetForm.currentValue} onChange={(e) => setAssetForm({ ...assetForm, currentValue: e.target.value })} /></label>
          <label className="text-xs">Annual depreciation rate<input className="msh-input mt-1" type="number" min="0" max="1" step="0.001" value={assetForm.depreciationRate} onChange={(e) => setAssetForm({ ...assetForm, depreciationRate: e.target.value })} placeholder="0 to 1" /></label>
        </div>
        <button className="msh-btn msh-btn-primary mt-3" disabled={!assetForm.assetCode || !assetForm.name || !assetForm.category || !assetForm.purchaseCost || !assetForm.currentValue} onClick={createAsset}>Register asset</button>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th className="py-2">Code</th><th>Name</th><th>Category</th><th>Location</th><th>Current value</th><th>Status</th><th /></tr></thead><tbody>{assets.map((asset) => <tr className="border-t" key={asset.id}><td className="py-2 font-mono text-xs">{asset.assetCode}</td><td>{asset.name}</td><td>{asset.category}</td><td>{asset.locationDescription || "—"}</td><td>${Number(asset.currentValue).toFixed(2)}</td><td>{asset.isActive ? "Active" : "Inactive"}</td><td><button className="text-xs border rounded px-2 py-1" onClick={() => setAssetStatus(asset)}>{asset.isActive ? "Deactivate" : "Reactivate"}</button></td></tr>)}{!assets.length && <tr><td colSpan={7} className="py-2 text-slate-500">No assets registered.</td></tr>}</tbody></table></div>
      </section>
      <section className="msh-card p-4 mb-6">
        <div className="flex flex-wrap justify-between items-start gap-2"><div><h2 className="font-semibold">Preventive maintenance</h2><p className="text-xs text-slate-500">Due schedules create an asset ticket and assign a work order to the selected technician.</p></div><button className="msh-btn" onClick={generateDuePlans}>Generate due work orders</button></div>
        <div className="grid md:grid-cols-3 gap-2 mt-3">
          <input className="msh-input" placeholder="Plan name" value={planForm.planName} onChange={(e) => setPlanForm({ ...planForm, planName: e.target.value })} />
          <input className="msh-input" placeholder="Maintenance task" value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} />
          <select className="msh-input" value={planForm.assetId} onChange={(e) => setPlanForm({ ...planForm, assetId: e.target.value })}><option value="">Asset…</option>{assets.filter((asset) => asset.isActive).map((asset) => <option value={asset.id} key={asset.id}>{asset.assetCode} · {asset.name}</option>)}</select>
          <label className="text-xs">Interval in days<input className="msh-input mt-1" type="number" min="1" value={planForm.intervalDays} onChange={(e) => setPlanForm({ ...planForm, intervalDays: e.target.value })} /></label>
          <label className="text-xs">Next due date<input className="msh-input mt-1" type="date" value={planForm.nextDueDate} onChange={(e) => setPlanForm({ ...planForm, nextDueDate: e.target.value })} /></label>
          <select className="msh-input" value={planForm.assignedTechnicianId} onChange={(e) => setPlanForm({ ...planForm, assignedTechnicianId: e.target.value })}><option value="">Technician…</option>{technicians.map((tech) => <option value={tech.id} key={tech.id}>{tech.fullName}</option>)}</select>
        </div>
        <button className="msh-btn msh-btn-primary mt-3" disabled={!planForm.planName || !planForm.description || !planForm.assetId || !planForm.assignedTechnicianId} onClick={createPlan}>Add preventive plan</button>
        <ul className="mt-4 divide-y text-sm">{plans.map((plan) => <li key={plan.id} className="py-2">{plan.planName} · {plan.asset.assetCode} {plan.asset.name} · every {plan.intervalDays} days · next due {plan.nextDueDate.slice(0, 10)} · {plan.assignedTechnician?.fullName ?? "Unassigned"}</li>)}{!plans.length && <li className="py-2 text-slate-500">No preventive plans configured.</li>}</ul>
      </section>
      <section className="msh-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[hsl(var(--muted))] text-left text-[hsl(var(--muted-foreground))]">
            <tr><th className="p-3">Ticket</th><th className="p-3">Issue</th><th className="p-3">Room / asset</th><th className="p-3">Priority</th><th className="p-3">Status</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-3 font-mono text-xs">{t.ticketNumber}</td>
                <td className="p-3">{t.description}</td>
                <td className="p-3">{t.room ? `Room ${t.room.number}` : t.asset?.name ?? "—"}</td>
                <td className="p-3"><span className={`msh-badge ${pri[t.priority]}`}>{t.priority}</span></td>
                <td className="p-3">{t.status}</td>
                <td className="p-3">{t.status === "OPEN" && <button className="text-xs text-[hsl(var(--accent))]" onClick={() => dispatch(t.id)}>Dispatch</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="msh-card overflow-hidden mt-6">
        <h2 className="font-semibold p-4 pb-0">My work orders</h2>
        <div className="divide-y">
          {workOrders.map((wo) => <div key={wo.id} className="p-4">
            <div className="flex flex-wrap justify-between gap-3 text-sm">
              <div><span className="font-mono text-xs">{wo.woNumber}</span> · {wo.ticket.description} · Room {wo.ticket.room?.number ?? "—"}<div className="text-xs text-slate-500 mt-1">{wo.status} · Parts ${Number(wo.partsCost).toFixed(2)} · {wo.parts.map((p) => `${p.quantityUsed} ${p.item.name}`).join(", ") || "No parts issued"}</div></div>
              <div className="flex gap-2 items-center">{wo.status === "ASSIGNED" && <button className="text-xs border rounded px-2 py-1" onClick={() => start(wo.id)}>Start</button>}{["ASSIGNED", "IN_PROGRESS"].includes(wo.status) && <button className="text-xs border rounded px-2 py-1" onClick={() => complete(wo.id)}>Complete</button>}</div>
            </div>
            {["ASSIGNED", "IN_PROGRESS"].includes(wo.status) && <div className="grid sm:grid-cols-4 gap-2 mt-3">
              <select className="msh-input" value={partForm.itemId} onChange={(e) => setPartForm({ ...partForm, itemId: e.target.value })}><option value="">Part…</option>{items.map((item) => <option key={item.id} value={item.id}>{item.itemCode} · {item.name} ({item.baseUnitOfMeasure})</option>)}</select>
              <select className="msh-input" value={partForm.storeLocationId} onChange={(e) => setPartForm({ ...partForm, storeLocationId: e.target.value })}><option value="">Store…</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.locationName}</option>)}</select>
              <input className="msh-input" type="number" min="0.01" step="0.01" value={partForm.quantityUsed} onChange={(e) => setPartForm({ ...partForm, quantityUsed: Number(e.target.value) })} />
              <button className="msh-btn" onClick={() => issuePart(wo.id)}>Issue part</button>
            </div>}
          </div>)}
          {!workOrders.length && <p className="p-4 text-sm text-slate-500">No active work orders are assigned to you.</p>}
        </div>
      </section>
    </div>
  );
}
