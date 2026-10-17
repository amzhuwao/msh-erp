"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Item {
  id: string; itemCode: string; name: string; category: string; currentAverageCost: string; reorderLevel: string;
  balances: { quantityOnHand: string; storeLocation: { id: string; locationName: string } }[];
}
interface Loc { id: string; locationName: string }
interface SupplyIssue { id: string; issueNumber: string; date: string; roomCount: number; status: string; attendant: { fullName: string }; lines: { id: string; quantity: string; item: { name: string; baseUnitOfMeasure: string }; storeLocation: { locationName: string } }[] }
interface CountAdjustment { id: string; bookQuantity: string; countedQuantity: string; adjustmentDelta: string; varianceValue: string; referenceDocument: string; reason: string; item: { itemCode: string; name: string; baseUnitOfMeasure: string }; storeLocation: { locationName: string }; requestedBy: { fullName: string } }
const today = new Date().toISOString().slice(0, 10);

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [alerts, setAlerts] = useState<Item[]>([]);
  const [supplyIssues, setSupplyIssues] = useState<SupplyIssue[]>([]);
  const [countAdjustments, setCountAdjustments] = useState<CountAdjustment[]>([]);
  const [threshold, setThreshold] = useState(100);
  const [thresholdDraft, setThresholdDraft] = useState("100");
  const [notice, setNotice] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [xfer, setXfer] = useState({ itemId: "", fromLocationId: "", toLocationId: "", quantity: 1, referenceDocument: "TRF-UI" });
  const [count, setCount] = useState({ itemId: "", storeLocationId: "", countedQuantity: 0, referenceDocument: "COUNT-UI", reason: "" });

  function load() {
    apiFetch<{ items: Item[] }>("/api/inventory/items").then((d) => setItems(d.items));
    apiFetch<{ items: Loc[] }>("/api/inventory/locations").then((d) => setLocations(d.items));
    apiFetch<{ items: Item[] }>("/api/inventory/alerts/low-stock").then((d) => setAlerts(d.items));
    apiFetch<{ items: CountAdjustment[] }>("/api/inventory/count-adjustments/pending").then((d) => setCountAdjustments(d.items));
    apiFetch<{ threshold: number }>("/api/inventory/count-adjustment-threshold").then((d) => { setThreshold(d.threshold); setThresholdDraft(String(d.threshold)); });
    loadSupplyIssues(issueDate);
  }
  function loadSupplyIssues(date: string) {
    apiFetch<{ items: SupplyIssue[] }>(`/api/inventory/housekeeping-issues?date=${date}`).then((d) => setSupplyIssues(d.items));
  }
  useEffect(() => { load(); }, []);

  async function transfer() {
    await apiFetch("/api/inventory/transfers", { method: "POST", body: JSON.stringify({ ...xfer, quantity: Number(xfer.quantity) }) });
    load();
  }

  async function approveSupplyIssue(id: string) {
    await apiFetch(`/api/inventory/housekeeping-issues/${id}/approve`, { method: "POST" });
    load();
  }

  async function reconcile() {
    const result = await apiFetch<{ status: string }>("/api/inventory/reconcile-count", { method: "POST", body: JSON.stringify({ ...count, countedQuantity: Number(count.countedQuantity) }) });
    setNotice(result.status === "PENDING_APPROVAL" ? "Large variance sent for secondary approval; stock remains unchanged." : result.status === "POSTED" ? "Count adjustment posted." : "No variance found.");
    setCount({ ...count, reason: "" });
    load();
  }

  async function setApprovalThreshold() {
    await apiFetch("/api/inventory/count-adjustment-threshold", { method: "PUT", body: JSON.stringify({ threshold: Number(thresholdDraft) }) });
    setNotice("Stock adjustment approval threshold updated.");
    load();
  }
  async function decideAdjustment(id: string, approve: boolean) {
    if (approve) await apiFetch(`/api/inventory/count-adjustments/${id}/approve`, { method: "POST" });
    else {
      const reason = window.prompt("Reason for rejecting this stock count adjustment:");
      if (!reason) return;
      await apiFetch(`/api/inventory/count-adjustments/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
    }
    setNotice(approve ? "Stock adjustment approved and posted." : "Stock adjustment rejected.");
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
      <section className="msh-card p-4 mb-6">
        <h2 className="font-semibold mb-1">Physical stock count</h2>
        <p className="text-xs text-slate-500 mb-3">Adjustments require a count sheet reference and explanation. Variances worth at least ${threshold.toFixed(2)} require another authorized user to approve before stock changes.</p>
        <div className="grid md:grid-cols-3 gap-2">
          <select className="msh-input" value={count.itemId} onChange={(e) => setCount({ ...count, itemId: e.target.value })}>
            <option value="">Item…</option>{items.map((i) => <option key={i.id} value={i.id}>{i.itemCode} · {i.name}</option>)}
          </select>
          <select className="msh-input" value={count.storeLocationId} onChange={(e) => setCount({ ...count, storeLocationId: e.target.value })}>
            <option value="">Store…</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.locationName}</option>)}
          </select>
          <input className="msh-input" aria-label="Counted quantity" type="number" min="0" value={count.countedQuantity} onChange={(e) => setCount({ ...count, countedQuantity: Number(e.target.value) })} />
          <input className="msh-input" placeholder="Count sheet reference" value={count.referenceDocument} onChange={(e) => setCount({ ...count, referenceDocument: e.target.value })} />
          <input className="msh-input md:col-span-2" placeholder="Explain the variance" value={count.reason} onChange={(e) => setCount({ ...count, reason: e.target.value })} />
        </div>
        <button className="msh-btn msh-btn-primary mt-3" onClick={reconcile}>Post count adjustment</button>
        {notice && <p className="text-sm text-emerald-700 mt-2">{notice}</p>}
        <div className="border-t mt-4 pt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs">Secondary approval threshold ($)<input className="msh-input mt-1 w-48" type="number" min="0" value={thresholdDraft} onChange={(e) => setThresholdDraft(e.target.value)} /></label>
          <button className="msh-btn" onClick={setApprovalThreshold}>Save threshold</button>
        </div>
      </section>
      <section className="msh-card p-4 mb-6">
        <h2 className="font-semibold mb-3">Count adjustments awaiting approval</h2>
        <div className="space-y-3">{countAdjustments.map((adjustment) => <div key={adjustment.id} className="border rounded p-3 text-sm flex flex-wrap justify-between gap-3">
          <div><div className="font-medium">{adjustment.item.itemCode} · {adjustment.item.name} · {adjustment.storeLocation.locationName}</div><div className="text-xs text-slate-500">Book {adjustment.bookQuantity} → counted {adjustment.countedQuantity} {adjustment.item.baseUnitOfMeasure} · variance ${Number(adjustment.varianceValue).toFixed(2)} · {adjustment.referenceDocument}</div><div className="text-xs mt-1">{adjustment.reason} <span className="text-slate-500">· requested by {adjustment.requestedBy.fullName}</span></div></div>
          <div className="flex gap-2 items-center"><button className="text-xs border rounded px-2 py-1" onClick={() => decideAdjustment(adjustment.id, true)}>Approve & post</button><button className="text-xs border rounded px-2 py-1" onClick={() => decideAdjustment(adjustment.id, false)}>Reject</button></div>
        </div>)}{!countAdjustments.length && <p className="text-sm text-slate-500">No count adjustments are awaiting approval.</p>}</div>
      </section>
      <section className="msh-card p-4 mb-6">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-3"><div><h2 className="font-semibold">Housekeeping supply issue vouchers</h2><p className="text-xs text-slate-500">Approving a draft posts the stock issues and updates store balances.</p></div><input className="msh-input max-w-48" type="date" value={issueDate} onChange={(e) => { setIssueDate(e.target.value); loadSupplyIssues(e.target.value); }} /></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-[hsl(var(--muted))] text-left"><tr><th className="p-3">Voucher</th><th className="p-3">Attendant</th><th className="p-3">Rooms</th><th className="p-3">Items / locations</th><th className="p-3">Status</th><th className="p-3" /></tr></thead><tbody>{supplyIssues.map((issue) => <tr key={issue.id} className="border-t"><td className="p-3 font-mono text-xs">{issue.issueNumber}</td><td className="p-3">{issue.attendant.fullName}</td><td className="p-3">{issue.roomCount}</td><td className="p-3 text-xs">{issue.lines.map((line) => `${line.quantity} ${line.item.baseUnitOfMeasure} ${line.item.name} · ${line.storeLocation.locationName}`).join("; ")}</td><td className="p-3">{issue.status}</td><td className="p-3">{issue.status === "DRAFT" && <button className="text-xs border rounded px-2 py-1" onClick={() => void approveSupplyIssue(issue.id)}>Approve & issue</button>}</td></tr>)}{!supplyIssues.length && <tr><td colSpan={6} className="p-3 text-slate-500">No housekeeping vouchers for this date.</td></tr>}</tbody></table></div>
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
