"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, getStoredUser } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Stay { id: string; guest: { firstName: string; lastName: string }; room: { number: string } | null; cashOnly: boolean }
interface CatalogItem { id: string; name: string; category: string; price: string; mealPeriod: string | null }
interface MenuItem { id: string; name: string; category: string; price: string; mealPeriod: string | null }
interface Runner { id: string; fullName: string; role: { name: string } }
interface Order {
  id: string; serviceNumber: string; serviceType: string; priority: string; status: string; totalCharge: string; specialInstructions: string | null; createdAt: string;
  reservation: { guest: { firstName: string; lastName: string }; room: { number: string } | null };
  runner: { id: string; fullName: string } | null;
  transitLogs: { passengerName: string; transitType: string; scheduledTime: string; vehiclePlateNumber: string | null }[];
  posOrder: { orderNumber: string } | null;
}
interface Overdue { id: string; serviceNumber: string; overdueMinutes: number; reservation: { guest: { firstName: string; lastName: string }; room: { number: string } | null }; specialInstructions: string | null }

const types = ["LAUNDRY", "ROOM_SERVICE", "TRANSIT", "CONCIERGE", "OTHERS"];
const colors: Record<string, string> = { LAUNDRY: "bg-blue-100 text-blue-800", ROOM_SERVICE: "bg-red-100 text-red-800", TRANSIT: "bg-emerald-100 text-emerald-800", CONCIERGE: "bg-violet-100 text-violet-800", OTHERS: "bg-slate-100 text-slate-700" };

export default function GuestServicesPage() {
  const user = getStoredUser();
  const manager = /supervisor|administrator|manager/i.test(user?.roleName ?? "");
  const canCreate = Boolean(user?.permissions.GuestServices?.includes("CREATE"));
  const [orders, setOrders] = useState<Order[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [runners, setRunners] = useState<Runner[]>([]);
  const [overdue, setOverdue] = useState<Overdue[]>([]);
  const [form, setForm] = useState({ reservationId: "", serviceType: "LAUNDRY", catalogItemId: "", totalCharge: "", priority: "NORMAL", specialInstructions: "" });
  const [menuChoice, setMenuChoice] = useState("");
  const [menuQuantity, setMenuQuantity] = useState(1);
  const [posItems, setPosItems] = useState<{ menuItemId: string; quantity: number }[]>([]);
  const [transit, setTransit] = useState({ reservationId: "", passengerName: "", transitType: "AIRPORT_PICKUP", scheduledTime: "", driverUserId: "", vehiclePlateNumber: "", totalCharge: "0" });
  const [dispatchSelection, setDispatchSelection] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [requestData, catalogData, runnerData, stayData, menuData, overdueData] = await Promise.all([
      apiFetch<{ items: Order[] }>(manager ? "/api/services/active-requests" : "/api/services/my-queue"),
      apiFetch<{ items: CatalogItem[] }>("/api/services/catalog"),
      apiFetch<{ items: Runner[] }>("/api/services/runners"),
      apiFetch<{ items: Stay[] }>("/api/front-office/in-house"),
      apiFetch<{ items: MenuItem[] }>("/api/services/room-service-menu"),
      manager ? apiFetch<{ items: Overdue[] }>("/api/services/overdue-alerts") : Promise.resolve({ items: [] as Overdue[] }),
    ]);
    setOrders(requestData.items); setCatalog(catalogData.items); setRunners(runnerData.items); setStays(stayData.items); setMenu(menuData.items); setOverdue(overdueData.items);
  }
  useEffect(() => { void load().catch((err) => setError(err instanceof Error ? err.message : "Could not load guest services")); }, []);

  const selectedStay = useMemo(() => stays.find((stay) => stay.id === form.reservationId), [stays, form.reservationId]);
  const selectedMenu = menu.find((item) => item.id === menuChoice);
  async function run(action: () => Promise<void>) {
    setError(""); setBusy(true);
    try { await action(); }
    catch (err) { setError(err instanceof Error ? err.message : "Guest service action failed"); }
    finally { setBusy(false); }
  }
  async function createOrder(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      await apiFetch("/api/services/orders", { method: "POST", body: JSON.stringify({ ...form, catalogItemId: form.catalogItemId || undefined, totalCharge: form.serviceType === "ROOM_SERVICE" ? undefined : Number(form.totalCharge || 0), posItems: form.serviceType === "ROOM_SERVICE" ? posItems : undefined, priority: form.priority }) });
      setForm({ ...form, catalogItemId: "", totalCharge: "", specialInstructions: "" }); setPosItems([]); await load();
    });
  }
  async function scheduleTransit(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      await apiFetch("/api/services/transit/schedule", { method: "POST", body: JSON.stringify({ ...transit, scheduledTime: new Date(transit.scheduledTime).toISOString(), driverUserId: transit.driverUserId || undefined, totalCharge: Number(transit.totalCharge), priority: "NORMAL" }) });
      setTransit({ ...transit, passengerName: "", scheduledTime: "", vehiclePlateNumber: "", totalCharge: "0" }); await load();
    });
  }
  async function setCashOnly(cashOnly: boolean) {
    if (!selectedStay) return;
    await run(async () => { await apiFetch(`/api/services/reservations/${selectedStay.id}/cash-only`, { method: "PUT", body: JSON.stringify({ cashOnly }) }); await load(); });
  }
  async function dispatch(orderId: string) {
    const runnerUserId = dispatchSelection[orderId];
    if (!runnerUserId) return;
    await run(async () => { await apiFetch(`/api/services/orders/${orderId}/assign`, { method: "PUT", body: JSON.stringify({ runnerUserId }) }); await load(); });
  }
  async function setStatus(order: Order, status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED") {
    await run(async () => { await apiFetch(`/api/services/orders/${order.id}/status`, { method: "PUT", body: JSON.stringify({ status }) }); await load(); });
  }
  function addMenuLine() {
    if (!menuChoice) return;
    setPosItems((current) => [...current, { menuItemId: menuChoice, quantity: menuQuantity }]); setMenuChoice(""); setMenuQuantity(1);
  }

  return <div className="p-6 space-y-5">
    <PageHeader title="Guest Services" description={manager ? "Dispatch and track guest requests, transit, and room-service kitchen tickets" : "Your assigned requests and transit runs"} />
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {manager && overdue.length > 0 && <section role="alert" className="rounded-xl border-2 border-red-400 bg-red-50 p-4 text-red-900"><h2 className="font-bold">Overdue concierge requests</h2><ul className="mt-2 space-y-1">{overdue.map((item) => <li key={item.id} className="text-sm">{item.reservation.room ? `Room ${item.reservation.room.number} · ` : ""}{item.reservation.guest.firstName} {item.reservation.guest.lastName} · {item.serviceNumber} · {item.overdueMinutes} min overdue{item.specialInstructions ? ` · ${item.specialInstructions}` : ""}</li>)}</ul></section>}

    {canCreate && <section className="msh-card p-4">
      <h2 className="font-semibold mb-3">Log a guest request</h2>
      <form onSubmit={createOrder} className="grid md:grid-cols-3 gap-2">
        <select required className="msh-input" value={form.reservationId} onChange={(e) => setForm({ ...form, reservationId: e.target.value })}><option value="">In-house guest…</option>{stays.map((stay) => <option key={stay.id} value={stay.id}>{stay.guest.firstName} {stay.guest.lastName} {stay.room ? `· Room ${stay.room.number}` : ""}</option>)}</select>
        <select className="msh-input" value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value, catalogItemId: "", totalCharge: "", priority: "NORMAL" })}>{types.map((type) => <option key={type}>{type}</option>)}</select>
        {form.serviceType === "ROOM_SERVICE" ? <div className="md:col-span-3 grid sm:grid-cols-[1fr_100px_auto] gap-2"><select className="msh-input" value={menuChoice} onChange={(e) => setMenuChoice(e.target.value)}><option value="">Restaurant menu…</option>{menu.map((item) => <option key={item.id} value={item.id}>{item.name} · ${Number(item.price).toFixed(2)}{item.mealPeriod ? ` · ${item.mealPeriod}` : ""}</option>)}</select><input className="msh-input" type="number" min="1" value={menuQuantity} onChange={(e) => setMenuQuantity(Number(e.target.value))} /><button type="button" className="msh-btn" disabled={!selectedMenu} onClick={addMenuLine}>Add item</button><div className="sm:col-span-3 flex flex-wrap gap-2">{posItems.map((line, index) => { const item = menu.find((entry) => entry.id === line.menuItemId); return <span key={`${line.menuItemId}-${index}`} className="rounded-full bg-red-50 px-3 py-1 text-xs">{line.quantity} × {item?.name}<button type="button" className="ml-2 text-red-700" onClick={() => setPosItems(posItems.filter((_, i) => i !== index))}>×</button></span>; })}</div></div> : <>
          <select className="msh-input" value={form.catalogItemId} onChange={(e) => { const item = catalog.find((entry) => entry.id === e.target.value); setForm({ ...form, catalogItemId: e.target.value, totalCharge: item ? String(Number(item.price)) : "" }); }}><option value="">Service catalog item…</option>{catalog.filter((item) => item.category !== "MEAL").map((item) => <option key={item.id} value={item.id}>{item.name} · ${Number(item.price).toFixed(2)}</option>)}</select>
          <input className="msh-input" type="number" min="0" step="0.01" placeholder="Charge ($)" value={form.totalCharge} onChange={(e) => setForm({ ...form, totalCharge: e.target.value })} />
        </>}
        <select className="msh-input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="NORMAL">Normal priority</option><option value="HIGH">High priority</option></select>
        <input className="msh-input md:col-span-2" placeholder="Instructions / guest notes" value={form.specialInstructions} onChange={(e) => setForm({ ...form, specialInstructions: e.target.value })} />
        {manager && selectedStay && <label className="md:col-span-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedStay.cashOnly} onChange={(e) => void setCashOnly(e.target.checked)} disabled={busy} />Cash-only folio (service charges require enough prepayment credit)</label>}
        <button disabled={busy || !form.reservationId || (form.serviceType === "ROOM_SERVICE" && !posItems.length)} className="msh-btn msh-btn-primary md:col-span-3">Create request</button>
      </form>
    </section>}

    {manager && canCreate && <section className="msh-card p-4">
      <h2 className="font-semibold mb-3">Schedule transit</h2>
      <form onSubmit={scheduleTransit} className="grid md:grid-cols-4 gap-2">
        <select required className="msh-input" value={transit.reservationId} onChange={(e) => setTransit({ ...transit, reservationId: e.target.value })}><option value="">In-house guest…</option>{stays.map((stay) => <option key={stay.id} value={stay.id}>{stay.guest.firstName} {stay.guest.lastName} {stay.room ? `· ${stay.room.number}` : ""}</option>)}</select>
        <input required className="msh-input" placeholder="Passenger name" value={transit.passengerName} onChange={(e) => setTransit({ ...transit, passengerName: e.target.value })} />
        <select className="msh-input" value={transit.transitType} onChange={(e) => setTransit({ ...transit, transitType: e.target.value })}>{["AIRPORT_PICKUP", "SHUTTLE_DROP", "TOURS"].map((type) => <option key={type}>{type}</option>)}</select>
        <input required className="msh-input" type="datetime-local" value={transit.scheduledTime} onChange={(e) => setTransit({ ...transit, scheduledTime: e.target.value })} />
        <select className="msh-input" value={transit.driverUserId} onChange={(e) => setTransit({ ...transit, driverUserId: e.target.value })}><option value="">Assign driver later</option>{runners.map((runner) => <option key={runner.id} value={runner.id}>{runner.fullName}</option>)}</select>
        <input className="msh-input" placeholder="Vehicle plate" value={transit.vehiclePlateNumber} onChange={(e) => setTransit({ ...transit, vehiclePlateNumber: e.target.value })} />
        <input className="msh-input" type="number" min="0" step="0.01" aria-label="Transit charge" value={transit.totalCharge} onChange={(e) => setTransit({ ...transit, totalCharge: e.target.value })} />
        <button disabled={busy} className="msh-btn msh-btn-primary">Schedule transit</button>
      </form>
    </section>}

    <section className="msh-card overflow-x-auto"><table className="w-full text-sm"><thead className="bg-[hsl(var(--muted))] text-left"><tr><th className="p-3">Request</th><th className="p-3">Guest / room</th><th className="p-3">Type / priority</th><th className="p-3">Schedule / kitchen</th><th className="p-3">Runner</th><th className="p-3">Charge / status</th><th className="p-3">Actions</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t align-top"><td className="p-3 font-mono text-xs">{order.serviceNumber}<div className="text-[10px] text-slate-500">{new Date(order.createdAt).toLocaleString()}</div></td><td className="p-3">{order.reservation.guest.firstName} {order.reservation.guest.lastName}<div className="text-xs text-slate-500">{order.reservation.room ? `Room ${order.reservation.room.number}` : "—"}</div></td><td className="p-3"><span className={`msh-badge ${colors[order.serviceType] ?? ""}`}>{order.serviceType}</span>{order.priority === "HIGH" && <div className="mt-1 text-xs font-semibold text-red-700">HIGH</div>}</td><td className="p-3 text-xs">{order.transitLogs.map((log) => <div key={log.passengerName}>{log.transitType} · {new Date(log.scheduledTime).toLocaleString()}</div>)}{order.posOrder && <span className="font-mono text-red-700">Kitchen: {order.posOrder.orderNumber}</span>}</td><td className="p-3">{manager && order.status !== "COMPLETED" && order.status !== "CANCELLED" ? <div className="flex gap-1"><select className="msh-input text-xs" value={dispatchSelection[order.id] ?? order.runner?.id ?? ""} onChange={(e) => setDispatchSelection({ ...dispatchSelection, [order.id]: e.target.value })}><option value="">Select runner</option>{runners.map((runner) => <option key={runner.id} value={runner.id}>{runner.fullName}</option>)}</select><button disabled={busy || !dispatchSelection[order.id]} onClick={() => void dispatch(order.id)} className="text-xs border rounded px-2">Dispatch</button></div> : order.runner?.fullName ?? "Unassigned"}</td><td className="p-3">${Number(order.totalCharge).toFixed(2)}<div>{order.status}</div></td><td className="p-3"><div className="flex flex-wrap gap-1">{order.status === "DISPATCHED" && <button disabled={busy} className="text-xs border rounded px-2 py-1" onClick={() => void setStatus(order, "IN_PROGRESS")}>Start</button>}{order.status === "IN_PROGRESS" && <button disabled={busy} className="text-xs border rounded px-2 py-1" onClick={() => void setStatus(order, "COMPLETED")}>Complete</button>}{manager && !["COMPLETED", "CANCELLED"].includes(order.status) && <button disabled={busy} className="text-xs border rounded px-2 py-1 text-red-700" onClick={() => void setStatus(order, "CANCELLED")}>Cancel</button>}</div></td></tr>)}{!orders.length && <tr><td colSpan={7} className="p-3 text-slate-500">No active guest service requests.</td></tr>}</tbody></table></section>
  </div>;
}
