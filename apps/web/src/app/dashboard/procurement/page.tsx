"use client";

import { useEffect, useState } from "react";
import { apiFetch, getStoredUser, type AuthUser } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Supplier { id: string; name: string; code: string }
interface Requisition { id: string; requisitionNumber: string; approvalStatus: string; department: { name: string }; notes: string | null; purchaseOrder: { id: string; poNumber: string; status: string } | null; items: { id: string; description: string; quantityRequested: string; estimatedUnitPrice: string }[] }
interface POItem { id: string; description: string; quantity: string; receivedQty: string; unitPrice: string }
interface SupplierQuote { id: string; quoteNumber: string; totalAmount: string; isSelected: boolean; supplier: { id: string; name: string }; lines: { purchaseOrderItemId: string; quotedQuantity: string; quotedUnitPrice: string }[] }
interface PO { id: string; poNumber: string; status: string; totalAmount: string; requiredApprovals: number; approvals: { user: { id: string; fullName: string } }[]; supplier: { name: string }; items: POItem[]; supplierQuotes: SupplierQuote[] }
interface ApprovalTier { id?: string; minimumTotal: string | number; requiredApprovals: number }
interface Invoice { id: string; invoiceNumber: string; status: string; totalAmount: string; supplier: { name: string }; purchaseOrder: { poNumber: string } }
interface Dept { id: string; name: string }
interface Item { id: string; name: string }

export default function ProcurementPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [reqs, setReqs] = useState<Requisition[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<{ id: string; locationName: string }[]>([]);
  const [approvalTiers, setApprovalTiers] = useState<ApprovalTier[]>([]);
  const [reqForm, setReqForm] = useState({ departmentId: "", requiredDate: new Date().toISOString().slice(0, 10), description: "", quantityRequested: 1, estimatedUnitPrice: 10 });
  const [poForm, setPoForm] = useState({ supplierId: "", description: "Stock replenishment", quantity: 6, unitPrice: 12, itemId: "" });
  const [invoiceReference, setInvoiceReference] = useState("");
  const [invoiceForm, setInvoiceForm] = useState({ purchaseOrderId: "", invoiceNumber: "", taxAmount: "" });
  const [invoiceLines, setInvoiceLines] = useState<{ purchaseOrderItemId: string; billedQuantity: number; billedUnitPrice: number }[]>([]);
  const [quoteForm, setQuoteForm] = useState({ purchaseOrderId: "", supplierId: "", quoteNumber: "" });
  const [quoteLines, setQuoteLines] = useState<{ purchaseOrderItemId: string; quotedQuantity: number; quotedUnitPrice: number }[]>([]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const canApprove = !!user?.permissions?.Procurement?.includes("APPROVE");
  const canConfigure = !!user?.permissions?.Procurement?.includes("EDIT");

  function load() {
    apiFetch<{ items: Supplier[] }>("/api/procurement/suppliers").then((d) => setSuppliers(d.items));
    apiFetch<{ items: Requisition[] }>("/api/procurement/requisitions").then((d) => setReqs(d.items));
    apiFetch<{ items: PO[] }>("/api/procurement/purchase-orders").then((d) => setPos(d.items));
    apiFetch<{ items: Invoice[] }>("/api/procurement/supplier-invoices").then((d) => setInvoices(d.items));
    apiFetch<{ items: Dept[] }>("/api/property/departments").then((d) => setDepts(d.items));
    apiFetch<{ items: Item[] }>("/api/inventory/items").then((d) => setItems(d.items));
    apiFetch<{ items: { id: string; locationName: string }[] }>("/api/inventory/locations").then((d) => setLocations(d.items));
    apiFetch<{ items: ApprovalTier[] }>("/api/procurement/approval-tiers").then((d) => setApprovalTiers(d.items));
  }
  useEffect(() => { setUser(getStoredUser()); load(); }, []);

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
    if (!loc || !po.items.length) return;
    const lines = po.items.map((item) => ({ purchaseOrderItemId: item.id, quantity: Number(item.quantity) - Number(item.receivedQty) })).filter((line) => line.quantity > 0);
    if (!lines.length) return;
    await apiFetch("/api/procurement/grn", {
      method: "POST",
      body: JSON.stringify({
        purchaseOrderId: po.id,
        storeLocationId: loc.id,
        invoiceReference: invoiceReference || undefined,
        lines,
      }),
    });
    setInvoiceReference("");
    load();
  }
  async function approvePo(id: string) {
    await apiFetch(`/api/procurement/purchase-orders/${id}/approve`, { method: "PUT" });
    load();
  }
  async function saveApprovalTiers() {
    await apiFetch("/api/procurement/approval-tiers", { method: "PUT", body: JSON.stringify({ tiers: approvalTiers.map((tier) => ({ minimumTotal: Number(tier.minimumTotal), requiredApprovals: Number(tier.requiredApprovals) })) }) });
    load();
  }
  function selectQuoteOrder(id: string) {
    const order = pos.find((candidate) => candidate.id === id);
    setQuoteForm({ ...quoteForm, purchaseOrderId: id });
    setQuoteLines(order?.items.map((line) => ({ purchaseOrderItemId: line.id, quotedQuantity: Number(line.quantity), quotedUnitPrice: Number(line.unitPrice) })) ?? []);
  }
  async function recordQuote() {
    await apiFetch(`/api/procurement/purchase-orders/${quoteForm.purchaseOrderId}/supplier-quotes`, { method: "POST", body: JSON.stringify({ supplierId: quoteForm.supplierId, quoteNumber: quoteForm.quoteNumber, lines: quoteLines }) });
    setQuoteForm({ purchaseOrderId: "", supplierId: "", quoteNumber: "" }); setQuoteLines([]); load();
  }
  async function selectQuote(poId: string, quoteId: string) {
    await apiFetch(`/api/procurement/purchase-orders/${poId}/supplier-quotes/${quoteId}/select`, { method: "PUT" }); load();
  }
  function selectInvoiceOrder(id: string) {
    const order = pos.find((candidate) => candidate.id === id);
    setInvoiceForm({ ...invoiceForm, purchaseOrderId: id });
    setInvoiceLines(order?.items.filter((line) => Number(line.receivedQty) > 0).map((line) => ({ purchaseOrderItemId: line.id, billedQuantity: Number(line.receivedQty), billedUnitPrice: Number(line.unitPrice) })) ?? []);
  }
  async function validateInvoice() {
    await apiFetch("/api/procurement/supplier-invoices/validate-match", { method: "POST", body: JSON.stringify({ purchaseOrderId: invoiceForm.purchaseOrderId, invoiceNumber: invoiceForm.invoiceNumber, taxAmount: invoiceForm.taxAmount ? Number(invoiceForm.taxAmount) : undefined, lines: invoiceLines }) });
    setInvoiceForm({ purchaseOrderId: "", invoiceNumber: "", taxAmount: "" });
    setInvoiceLines([]);
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
            <div className="grid grid-cols-2 gap-2"><label className="text-xs">Required date<input className="msh-input mt-1" type="date" value={reqForm.requiredDate} onChange={(e) => setReqForm({ ...reqForm, requiredDate: e.target.value })} /></label><label className="text-xs">Quantity<input className="msh-input mt-1" type="number" min="0.01" step="0.01" value={reqForm.quantityRequested} onChange={(e) => setReqForm({ ...reqForm, quantityRequested: Number(e.target.value) })} /></label></div>
            <label className="text-xs">Estimated unit price<input className="msh-input mt-1" type="number" min="0" step="0.01" value={reqForm.estimatedUnitPrice} onChange={(e) => setReqForm({ ...reqForm, estimatedUnitPrice: Number(e.target.value) })} /></label>
            <button className="msh-btn msh-btn-primary" disabled={!reqForm.departmentId || !reqForm.description.trim() || reqForm.quantityRequested <= 0} onClick={submitReq}>Submit requisition</button>
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
            <input className="msh-input" placeholder="Line description" value={poForm.description} onChange={(e) => setPoForm({ ...poForm, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-2"><label className="text-xs">Quantity<input className="msh-input mt-1" type="number" min="0.01" step="0.01" value={poForm.quantity} onChange={(e) => setPoForm({ ...poForm, quantity: Number(e.target.value) })} /></label><label className="text-xs">Unit price<input className="msh-input mt-1" type="number" min="0" step="0.01" value={poForm.unitPrice} onChange={(e) => setPoForm({ ...poForm, unitPrice: Number(e.target.value) })} /></label></div>
            <button className="msh-btn msh-btn-primary" disabled={!poForm.supplierId || !poForm.description.trim() || poForm.quantity <= 0} onClick={createPo}>Create PO</button>
          </div>
        </section>
      </div>
      <section className="msh-card overflow-hidden mb-6">
        <div className="p-4 pb-0"><h2 className="font-semibold">Requisitions</h2><p className="text-xs text-slate-500">Requisitions can be reviewed and approved here. Requisition-to-purchase-order conversion is planned for a future release.</p></div>
        <ul className="text-sm p-4 space-y-2">
          {reqs.map((r) => (
            <li key={r.id} className="flex justify-between">
              <span>{r.requisitionNumber} · {r.department.name}<span className="block text-xs text-slate-500">{r.items.map((item) => `${item.quantityRequested} × ${item.description}`).join("; ")}</span></span>
              <span className="flex gap-2 items-center">
                {r.approvalStatus}
                {r.approvalStatus === "SUBMITTED" && canApprove && <button className="text-[hsl(var(--accent))]" onClick={() => apiFetch(`/api/procurement/requisitions/${r.id}/approve`, { method: "PUT" }).then(load)}>Approve</button>}
                {r.purchaseOrder && <span className="text-xs">PO {r.purchaseOrder.poNumber}</span>}
              </span>
            </li>
          ))}
          {reqs.length === 0 && <li className="text-[hsl(var(--muted-foreground))]">None yet</li>}
        </ul>
      </section>
      <section className="msh-card overflow-hidden">
        <h2 className="font-semibold p-4 pb-0">Purchase orders</h2>
        {canConfigure && <div className="m-4 rounded border p-3"><h3 className="text-sm font-medium">Record supplier quotation</h3><p className="text-xs text-slate-500 mb-2">Record comparable offers against an unapproved order. Selecting an offer updates its supplier and line prices before approval.</p><div className="grid md:grid-cols-3 gap-2"><select className="msh-input" value={quoteForm.purchaseOrderId} onChange={(e) => selectQuoteOrder(e.target.value)}><option value="">Purchase order…</option>{pos.filter((po) => po.status === "PENDING_APPROVAL" && po.approvals.length === 0).map((po) => <option value={po.id} key={po.id}>{po.poNumber}</option>)}</select><select className="msh-input" value={quoteForm.supplierId} onChange={(e) => setQuoteForm({ ...quoteForm, supplierId: e.target.value })}><option value="">Supplier…</option>{suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}</select><input className="msh-input" placeholder="Supplier quote reference" value={quoteForm.quoteNumber} onChange={(e) => setQuoteForm({ ...quoteForm, quoteNumber: e.target.value })} /></div><div className="mt-2 space-y-2">{quoteLines.map((line, index) => { const po = pos.find((candidate) => candidate.id === quoteForm.purchaseOrderId); const item = po?.items.find((candidate) => candidate.id === line.purchaseOrderItemId); return <div className="grid md:grid-cols-3 gap-2 text-sm" key={line.purchaseOrderItemId}><span>{item?.description} · Qty {item?.quantity}</span><label className="text-xs">Quoted quantity<input className="msh-input mt-1" type="number" min="0.01" step="0.01" value={line.quotedQuantity} onChange={(e) => setQuoteLines(quoteLines.map((value, i) => i === index ? { ...value, quotedQuantity: Number(e.target.value) } : value))} /></label><label className="text-xs">Unit price<input className="msh-input mt-1" type="number" min="0" step="0.01" value={line.quotedUnitPrice} onChange={(e) => setQuoteLines(quoteLines.map((value, i) => i === index ? { ...value, quotedUnitPrice: Number(e.target.value) } : value))} /></label></div>; })}</div><button className="msh-btn mt-3" disabled={!quoteForm.purchaseOrderId || !quoteForm.supplierId || !quoteForm.quoteNumber || !quoteLines.length} onClick={recordQuote}>Record quotation</button></div>}
        {canConfigure && <div className="m-4 rounded border p-3"><div className="flex flex-wrap justify-between gap-2"><div><h3 className="text-sm font-medium">Approval tiers</h3><p className="text-xs text-slate-500">The highest minimum total at or below an order total sets the number of independent approvers. No tiers means one approver.</p></div><button className="text-xs border rounded px-2" onClick={() => setApprovalTiers([...approvalTiers, { minimumTotal: 5000, requiredApprovals: 2 }])}>Add tier</button></div><div className="mt-2 space-y-2">{approvalTiers.map((tier, index) => <div key={tier.id ?? index} className="grid grid-cols-[1fr_1fr_auto] gap-2"><label className="text-xs">Minimum total<input className="msh-input mt-1" type="number" min="0" step="0.01" value={tier.minimumTotal} onChange={(e) => setApprovalTiers(approvalTiers.map((value, i) => i === index ? { ...value, minimumTotal: e.target.value } : value))} /></label><label className="text-xs">Required approvers<input className="msh-input mt-1" type="number" min="1" max="5" step="1" value={tier.requiredApprovals} onChange={(e) => setApprovalTiers(approvalTiers.map((value, i) => i === index ? { ...value, requiredApprovals: Number(e.target.value) } : value))} /></label><button className="self-end text-xs text-red-700" onClick={() => setApprovalTiers(approvalTiers.filter((_, i) => i !== index))}>Remove</button></div>)}</div><button className="msh-btn mt-3" onClick={saveApprovalTiers}>Save tiers</button></div>}
        <div className="px-4 pt-3"><input className="msh-input max-w-sm" placeholder="Supplier invoice reference for next GRN (optional)" value={invoiceReference} onChange={(e) => setInvoiceReference(e.target.value)} /></div>
        <ul className="text-sm p-4 space-y-2">
          {pos.map((p) => (
            <li key={p.id} className="flex justify-between">
              <span>{p.poNumber} · {p.supplier.name} · ${Number(p.totalAmount).toFixed(2)}{p.supplierQuotes.length > 0 && <span className="block mt-1 text-xs text-slate-500">Quotes: {p.supplierQuotes.map((quote) => `${quote.supplier.name} ${quote.quoteNumber} $${Number(quote.totalAmount).toFixed(2)}${quote.isSelected ? " (selected)" : ""}`).join(" · ")}</span>}</span>
              <span className="flex gap-2">
                {p.status}
                {p.status === "PENDING_APPROVAL" && canConfigure && p.supplierQuotes.filter((quote) => quote.isSelected).length === 0 && p.supplierQuotes.map((quote) => <button key={quote.id} className="text-xs text-[hsl(var(--accent))]" onClick={() => selectQuote(p.id, quote.id)}>Select {quote.supplier.name}</button>)}
                {p.status === "PENDING_APPROVAL" && <><span className="text-xs text-slate-500">{p.approvals.length}/{p.requiredApprovals} approvals</span>{canApprove && !p.approvals.some((approval) => approval.user.id === user?.id) && <button className="text-[hsl(var(--accent))]" onClick={() => approvePo(p.id)}>Approve</button>}</>}
                {(p.status === "SENT_TO_SUPPLIER" || p.status === "PARTIALLY_RECEIVED") && (
                  <button className="text-[hsl(var(--accent))]" onClick={() => receive(p)}>Receive GRN</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="msh-card p-4 mt-6">
        <h2 className="font-semibold mb-3">Supplier invoice three-way match</h2>
        <div className="grid md:grid-cols-3 gap-2 mb-3">
          <select className="msh-input" value={invoiceForm.purchaseOrderId} onChange={(e) => selectInvoiceOrder(e.target.value)}><option value="">Received purchase order…</option>{pos.filter((p) => ["PARTIALLY_RECEIVED", "COMPLETED"].includes(p.status)).map((p) => <option key={p.id} value={p.id}>{p.poNumber} · {p.supplier.name}</option>)}</select>
          <input className="msh-input" placeholder="Supplier invoice number" value={invoiceForm.invoiceNumber} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })} />
          <input className="msh-input" type="number" min="0" placeholder="Tax amount (optional)" value={invoiceForm.taxAmount} onChange={(e) => setInvoiceForm({ ...invoiceForm, taxAmount: e.target.value })} />
        </div>
        <div className="space-y-2">{invoiceLines.map((line, index) => {
          const po = pos.find((candidate) => candidate.id === invoiceForm.purchaseOrderId);
          const item = po?.items.find((candidate) => candidate.id === line.purchaseOrderItemId);
          return <div key={line.purchaseOrderItemId} className="grid md:grid-cols-4 gap-2 text-sm items-center"><span>{item?.description} · Received {item?.receivedQty}</span><label className="text-xs">Billed qty<input className="msh-input mt-1" type="number" min="0.01" step="0.01" value={line.billedQuantity} onChange={(e) => setInvoiceLines(invoiceLines.map((l, i) => i === index ? { ...l, billedQuantity: Number(e.target.value) } : l))} /></label><label className="text-xs">Billed unit price<input className="msh-input mt-1" type="number" min="0" step="0.01" value={line.billedUnitPrice} onChange={(e) => setInvoiceLines(invoiceLines.map((l, i) => i === index ? { ...l, billedUnitPrice: Number(e.target.value) } : l))} /></label><span className="text-xs text-slate-500">PO unit price ${Number(item?.unitPrice ?? 0).toFixed(2)} (2% tolerance)</span></div>;
        })}</div>
        {canApprove && <button className="msh-btn msh-btn-primary mt-3" disabled={!invoiceForm.purchaseOrderId || !invoiceForm.invoiceNumber || !invoiceLines.length} onClick={validateInvoice}>Validate and record invoice</button>}
        <div className="border-t mt-4 pt-3"><h3 className="text-sm font-medium mb-2">Recent supplier invoices</h3><ul className="text-sm space-y-1">{invoices.map((invoice) => <li key={invoice.id}>{invoice.invoiceNumber} · {invoice.purchaseOrder.poNumber} · {invoice.supplier.name} · ${Number(invoice.totalAmount).toFixed(2)} · {invoice.status}</li>)}{!invoices.length && <li className="text-slate-500">No supplier invoices recorded.</li>}</ul></div>
      </section>
    </div>
  );
}
