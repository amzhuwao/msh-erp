"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Item {
  id: string; itemCode: string; name: string; category: string; currentAverageCost: string; reorderLevel: string;
  balances: { quantityOnHand: string; storeLocation: { id: string; locationName: string } }[];
}
interface Loc { id: string; locationName: string }

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [alerts, setAlerts] = useState<Item[]>([]);
  const [xfer, setXfer] = useState({ itemId: "", fromLocationId: "", toLocationId: "", quantity: 1, referenceDocument: "TRF-UI" });

  function load() {
    apiFetch<{ items: Item[] }>("/api/inventory/items").then((d) => setItems(d.items));
    apiFetch<{ items: Loc[] }>("/api/inventory/locations").then((d) => setLocations(d.items));
    apiFetch<{ items: Item[] }>("/api/inventory/alerts/low-stock").then((d) => setAlerts(d.items));
  }
  useEffect(() => { load(); }, []);

  async function transfer() {
    await apiFetch("/api/inventory/transfers", { method: "POST", body: JSON.stringify({ ...xfer, quantity: Number(xfer.quantity) }) });
    load();
  }

  return (
    <div className="p-6">
      <PageHeader title="Inventory & Stores" description="Stock balances, transfers, and reorder alerts" />
      {alerts.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-[var(--radius)] p-3 text-sm">
          Low stock: {alerts.map((a) => a.name).join(", ")}
        </div>
      )}
      <section className="msh-card p-4 mb-6">
        <h2 className="font-semibold mb-3">Transfer stock</h2>
        <div className="grid md:grid-cols-5 gap-2">
          <select className="msh-input" value={xfer.itemId} onChange={(e) => setXfer({ ...xfer, itemId: e.target.value })}>
            <option value="">Item…</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.itemCode} {i.name}</option>)}
          </select>
          <select className="msh-input" value={xfer.fromLocationId} onChange={(e) => setXfer({ ...xfer, fromLocationId: e.target.value })}>
            <option value="">From…</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.locationName}</option>)}
          </select>
          <select className="msh-input" value={xfer.toLocationId} onChange={(e) => setXfer({ ...xfer, toLocationId: e.target.value })}>
            <option value="">To…</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.locationName}</option>)}
          </select>
          <input className="msh-input" type="number" value={xfer.quantity} onChange={(e) => setXfer({ ...xfer, quantity: Number(e.target.value) })} />
          <button className="msh-btn msh-btn-primary" onClick={transfer}>Transfer</button>
        </div>
      </section>
      <section className="msh-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[hsl(var(--muted))] text-left text-[hsl(var(--muted-foreground))]">
            <tr><th className="p-3">Code</th><th className="p-3">Item</th><th className="p-3">Category</th><th className="p-3">Avg cost</th><th className="p-3">On hand</th></tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t">
                <td className="p-3 font-mono text-xs">{i.itemCode}</td>
                <td className="p-3">{i.name}</td>
                <td className="p-3">{i.category}</td>
                <td className="p-3">${Number(i.currentAverageCost).toFixed(2)}</td>
                <td className="p-3 text-xs">{i.balances.map((b) => `${b.storeLocation.locationName}: ${Number(b.quantityOnHand)}`).join(" · ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
