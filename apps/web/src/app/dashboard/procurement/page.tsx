"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Supplier { id: string; name: string; code: string }
interface Requisition { id: string; requisitionNumber: string; approvalStatus: string; department: { name: string }; notes: string | null }
interface PO { id: string; poNumber: string; status: string; totalAmount: string; supplier: { name: string }; items: { id: string; description: string; quantity: string; receivedQty: string }[] }
interface Dept { id: string; name: string }
interface Item { id: string; name: string }

export default function ProcurementPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [reqs, setReqs] = useState<Requisition[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<{ id: string; locationName: string }[]>([]);
  const [reqForm, setReqForm] = useState({ departmentId: "", requiredDate: new Date().toISOString().slice(0, 10), description: "", quantityRequested: 1, estimatedUnitPrice: 10 });
  const [poForm, setPoForm] = useState({ supplierId: "", description: "Stock replenishment", quantity: 6, unitPrice: 12, itemId: "" });

  function load() {
    apiFetch<{ items: Supplier[] }>("/api/procurement/suppliers").then((d) => setSuppliers(d.items));
    apiFetch<{ items: Requisition[] }>("/api/procurement/requisitions").then((d) => setReqs(d.items));
    apiFetch<{ items: PO[] }>("/api/procurement/purchase-orders").then((d) => setPos(d.items));
    apiFetch<{ items: Dept[] }>("/api/property/departments").then((d) => setDepts(d.items));
    apiFetch<{ items: Item[] }>("/api/inventory/items").then((d) => setItems(d.items));
    apiFetch<{ items: { id: string; locationName: string }[] }>("/api/inventory/locations").then((d) => setLocations(d.items));
  }
  useEffect(() => { load(); }, []);

  async function submitReq() {
    await apiFetch("/api/procurement/requisitions", {
      method: "POST",
      body: JSON.stringify({
        departmentId: reqForm.departmentId,
        requiredDate: reqForm.requiredDate,
        items: [{ description: reqForm.description, quantityRequested: Number(reqForm.quantityRequested), estimatedUnitPrice: Number(reqForm.estimatedUnitPrice) }],
      }),
    });
    load();
  }
  async function createPo() {
    await apiFetch("/api/procurement/purchase-orders", {
      method: "POST",
      body: JSON.stringify({
        supplierId: poForm.supplierId,
        items: [{ itemId: poForm.itemId || undefined, description: poForm.description, quantity: Number(poForm.quantity), unitPrice: Number(poForm.unitPrice) }],
      }),
    });
    load();
  }
  async function receive(po: PO) {
    const loc = locations[0];
    if (!loc || !po.items[0]) return;
    await apiFetch("/api/procurement/grn", {
      method: "POST",
      body: JSON.stringify({
        purchaseOrderId: po.id,
        storeLocationId: loc.id,
        lines: [{ purchaseOrderItemId: po.items[0].id, quantity: Number(po.items[0].quantity) }],
      }),
    });
    load();
  }

  return (
    <div className="p-6">
      <PageHeader title="Procurement" description="Requisitions, purchase orders, GRNs, and three-way match" />
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <section className="msh-card p-4">
          <h2 className="font-semibold mb-3">New requisition</h2>
          <div className="space-y-2">
            <select className="msh-input" value={reqForm.departmentId} onChange={(e) => setReqForm({ ...reqForm, departmentId: e.target.value })}>
              <option value="">Department…</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <input className="msh-input" placeholder="Item description" value={reqForm.description} onChange={(e) => setReqForm({ ...reqForm, description: e.target.value })} />
            <button className="msh-btn msh-btn-primary" onClick={submitReq}>Submit</button>
          </div>
        </section>
        <section className="msh-card p-4">
          <h2 className="font-semibold mb-3">Draft purchase order</h2>
          <div className="space-y-2">
            <select className="msh-input" value={poForm.supplierId} onChange={(e) => setPoForm({ ...poForm, supplierId: e.target.value })}>
              <option value="">Supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="msh-input" value={poForm.itemId} onChange={(e) => setPoForm({ ...poForm, itemId: e.target.value })}>
              <option value="">Stock item (optional)…</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <button className="msh-btn msh-btn-primary" onClick={createPo}>Create PO</button>
          </div>
        </section>
      </div>
      <section className="msh-card overflow-hidden mb-6">
        <h2 className="font-semibold p-4 pb-0">Requisitions</h2>
        <ul className="text-sm p-4 space-y-2">
          {reqs.map((r) => (
            <li key={r.id} className="flex justify-between">
              <span>{r.requisitionNumber} · {r.department.name}</span>
              <span className="flex gap-2 items-center">
                {r.approvalStatus}
                {r.approvalStatus === "SUBMITTED" && <button className="text-[hsl(var(--accent))]" onClick={() => apiFetch(`/api/procurement/requisitions/${r.id}/approve`, { method: "PUT" }).then(load)}>Approve</button>}
              </span>
            </li>
          ))}
          {reqs.length === 0 && <li className="text-[hsl(var(--muted-foreground))]">None yet</li>}
        </ul>
      </section>
      <section className="msh-card overflow-hidden">
        <h2 className="font-semibold p-4 pb-0">Purchase orders</h2>
        <ul className="text-sm p-4 space-y-2">
          {pos.map((p) => (
            <li key={p.id} className="flex justify-between">
              <span>{p.poNumber} · {p.supplier.name} · ${Number(p.totalAmount).toFixed(2)}</span>
              <span className="flex gap-2">
                {p.status}
                {(p.status === "SENT_TO_SUPPLIER" || p.status === "PARTIALLY_RECEIVED") && (
                  <button className="text-[hsl(var(--accent))]" onClick={() => receive(p)}>Receive GRN</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
