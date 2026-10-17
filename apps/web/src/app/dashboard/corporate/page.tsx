"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Profile {
  id: string;
  companyName: string;
  registrationNumber: string | null;
  contactName: string;
  contactEmail: string;
  phone: string | null;
  creditLimit: string;
  currentOutstanding: string;
  paymentTermsDays: number;
  isCreditApproved: boolean;
  isActive: boolean;
}
interface Contract {
  id: string;
  roomType: { code: string; name: string };
  contractedRate: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}
interface CreditTransaction {
  id: string;
  transactionType: string;
  amount: string;
  balanceAfter: string;
  referenceDetails: string | null;
  createdAt: string;
}
interface CorporateInvoice {
  id: string;
  invoiceNumber: string;
  amount: string;
  outstanding: string;
  issueDate: string;
  dueDate: string;
  status: string;
  referenceDetails: string | null;
}
interface Statement {
  company: Profile & { corporatePaidDepartments: string[]; contracts: Contract[]; invoices: CorporateInvoice[]; creditTransactions: CreditTransaction[] };
  outstanding: number;
  creditLimit: number;
  available: number;
  aging: { current: number; d30: number; d60: number; d90: number };
}
interface RoomType { id: string; code: string; name: string; baseRate: string }
interface EmailStatementResult { month: string; total: number; sent: number; failed: number; results: { companyId: string; companyName: string; email: string; sent: boolean; error?: string }[] }

const emptyProfile = {
  companyName: "", registrationNumber: "", contactName: "", contactEmail: "", phone: "",
  creditLimit: "0", paymentTermsDays: "30",
};

export default function CorporatePage() {
  const [items, setItems] = useState<Profile[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [selected, setSelected] = useState("");
  const [statement, setStatement] = useState<Statement | null>(null);
  const [profileForm, setProfileForm] = useState(emptyProfile);
  const [contractForm, setContractForm] = useState({ roomTypeId: "", contractedRate: "", startDate: "", endDate: "" });
  const [pay, setPay] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [statementMonth, setStatementMonth] = useState(new Date().toISOString().slice(0, 7));
  const [emailSummary, setEmailSummary] = useState("");
  const [billingDepartments, setBillingDepartments] = useState<string[]>(["ROOMS"]);
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeReference, setChargeReference] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadProfiles() {
    const data = await apiFetch<{ items: Profile[] }>("/api/corporate/profiles");
    setItems(data.items);
  }
  async function loadStatement(companyId: string) {
    if (!companyId) return;
    const data = await apiFetch<Statement>(`/api/corporate/profiles/${companyId}/statement`);
    setStatement(data);
    setCreditLimit(String(data.creditLimit));
    setBillingDepartments(data.company.corporatePaidDepartments);
  }

  useEffect(() => {
    void loadProfiles().catch((err) => setError(err instanceof Error ? err.message : "Could not load corporate clients"));
    apiFetch<{ items: RoomType[] }>("/api/corporate/room-types").then((d) => setRoomTypes(d.items)).catch(() => {});
  }, []);
  useEffect(() => {
    if (selected) void loadStatement(selected).catch((err) => setError(err instanceof Error ? err.message : "Could not load statement"));
    else setStatement(null);
  }, [selected]);

  async function run(action: () => Promise<void>) {
    setError("");
    setBusy(true);
    try { await action(); }
    catch (err) { setError(err instanceof Error ? err.message : "Corporate account action failed"); }
    finally { setBusy(false); }
  }

  async function createProfile(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const created = await apiFetch<Profile>("/api/corporate/profiles", {
        method: "POST",
        body: JSON.stringify({ ...profileForm, creditLimit: Number(profileForm.creditLimit), paymentTermsDays: Number(profileForm.paymentTermsDays), isCreditApproved: false }),
      });
      setProfileForm(emptyProfile);
      await loadProfiles();
      setSelected(created.id);
    });
  }

  async function createContract(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    await run(async () => {
      await apiFetch("/api/corporate/contracts", {
        method: "POST",
        body: JSON.stringify({ ...contractForm, companyId: selected, contractedRate: Number(contractForm.contractedRate) }),
      });
      setContractForm({ roomTypeId: "", contractedRate: "", startDate: "", endDate: "" });
      await loadStatement(selected);
    });
  }

  async function payNow(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    await run(async () => {
      await apiFetch("/api/corporate/payments", { method: "POST", body: JSON.stringify({ companyId: selected, amount: Number(pay), referenceDetails: paymentReference || undefined }) });
      setPay("");
      setPaymentReference("");
      await Promise.all([loadProfiles(), loadStatement(selected)]);
    });
  }

  async function approveCredit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    await run(async () => {
      await apiFetch(`/api/corporate/profiles/${selected}/credit-limit`, { method: "PUT", body: JSON.stringify({ creditLimit: Number(creditLimit) }) });
      await Promise.all([loadProfiles(), loadStatement(selected)]);
    });
  }

  async function postCharge(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    await run(async () => {
      await apiFetch("/api/corporate/charges", { method: "POST", body: JSON.stringify({ companyId: selected, amount: Number(chargeAmount), referenceDetails: chargeReference }) });
      setChargeAmount("");
      setChargeReference("");
      await Promise.all([loadProfiles(), loadStatement(selected)]);
    });
  }

  async function toggleActive() {
    if (!selected || !statement) return;
    await run(async () => {
      await apiFetch(`/api/corporate/profiles/${selected}/status`, { method: "PUT", body: JSON.stringify({ isActive: !statement.company.isActive }) });
      await Promise.all([loadProfiles(), loadStatement(selected)]);
    });
  }

  async function downloadStatement() {
    if (!selected) return;
    await run(async () => {
      const file = await apiFetch<{ filename: string; csv: string }>(`/api/corporate/profiles/${selected}/statement/export?month=${statementMonth}`);
      const url = URL.createObjectURL(new Blob([file.csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  }

  async function emailStatements() {
    if (!window.confirm(`Email ${statementMonth} statements to all active corporate clients?`)) return;
    await run(async () => {
      const result = await apiFetch<EmailStatementResult>("/api/corporate/statements/email", {
        method: "POST",
        body: JSON.stringify({ month: statementMonth }),
      });
      setEmailSummary(`${result.sent} of ${result.total} statements sent${result.failed ? `; ${result.failed} failed` : ""}.`);
    });
  }

  async function saveBillingRouting(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    await run(async () => {
      await apiFetch(`/api/corporate/profiles/${selected}/billing-routing`, { method: "PUT", body: JSON.stringify({ departments: billingDepartments }) });
      await loadStatement(selected);
    });
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Corporate Clients" description="Profiles, negotiated room rates, credit accounts, statements, and AR aging" />
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <details className="msh-card p-4">
        <summary className="cursor-pointer font-semibold">Register corporate client</summary>
        <form onSubmit={createProfile} className="grid md:grid-cols-3 gap-3 mt-4">
          <input className="msh-input" placeholder="Company name" required value={profileForm.companyName} onChange={(e) => setProfileForm({ ...profileForm, companyName: e.target.value })} />
          <input className="msh-input" placeholder="Registration number" value={profileForm.registrationNumber} onChange={(e) => setProfileForm({ ...profileForm, registrationNumber: e.target.value })} />
          <input className="msh-input" placeholder="Contact name" required value={profileForm.contactName} onChange={(e) => setProfileForm({ ...profileForm, contactName: e.target.value })} />
          <input className="msh-input" type="email" placeholder="Contact email" required value={profileForm.contactEmail} onChange={(e) => setProfileForm({ ...profileForm, contactEmail: e.target.value })} />
          <input className="msh-input" placeholder="Phone" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} />
          <input className="msh-input" type="number" min="0" step="0.01" aria-label="Proposed credit limit" value={profileForm.creditLimit} onChange={(e) => setProfileForm({ ...profileForm, creditLimit: e.target.value })} />
          <input className="msh-input" type="number" min="0" aria-label="Payment terms in days" value={profileForm.paymentTermsDays} onChange={(e) => setProfileForm({ ...profileForm, paymentTermsDays: e.target.value })} />
          <button disabled={busy} className="msh-btn msh-btn-primary md:col-span-2">Create unapproved profile</button>
        </form>
      </details>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="msh-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[hsl(var(--muted))] text-left text-[hsl(var(--muted-foreground))]"><tr><th className="p-3">Company</th><th className="p-3">Credit</th><th className="p-3">Outstanding</th><th className="p-3">Status</th></tr></thead>
            <tbody>{items.map((company) => (
              <tr key={company.id} className={`border-t cursor-pointer ${selected === company.id ? "bg-[hsl(var(--muted))]" : ""}`} onClick={() => setSelected(company.id)}>
                <td className="p-3">{company.companyName}<div className="text-xs text-slate-500">{company.contactName}</div></td>
                <td className="p-3">${Number(company.creditLimit).toFixed(2)}</td>
                <td className="p-3">${Number(company.currentOutstanding).toFixed(2)}</td>
                <td className="p-3">{!company.isActive ? "Inactive" : company.isCreditApproved ? "Approved" : "Pending approval"}</td>
              </tr>
            ))}{items.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={4}>No corporate clients registered.</td></tr>}</tbody>
          </table>
        </section>

        <section className="msh-card p-4">
          <h2 className="font-semibold mb-3">Statement and aging</h2>
          {!statement && <p className="text-sm text-[hsl(var(--muted-foreground))]">Select a company to view its account.</p>}
          {statement && <>
            <div className="flex justify-between items-start gap-3 mb-4"><div><div className="font-medium">{statement.company.companyName}</div><div className="text-xs text-slate-500">{statement.company.contactEmail} · {statement.company.paymentTermsDays} day terms</div></div><div className="flex flex-wrap gap-2"><input className="msh-input text-xs" type="month" aria-label="Statement month" value={statementMonth} onChange={(e) => { setStatementMonth(e.target.value); setEmailSummary(""); }} /><button onClick={() => void downloadStatement()} disabled={busy} className="text-xs border rounded px-2 py-1">Export CSV</button><button onClick={() => void emailStatements()} disabled={busy} className="text-xs border rounded px-2 py-1">Email all active</button><button onClick={() => void toggleActive()} disabled={busy} className="text-xs border rounded px-2 py-1">{statement.company.isActive ? "Deactivate" : "Reactivate"}</button></div></div>
            {emailSummary && <p role="status" className="text-xs text-emerald-700 mb-3">{emailSummary}</p>}
            <div className="grid grid-cols-2 gap-3 mb-4"><div className="msh-stat-card py-3"><div className="text-lg font-bold">${statement.outstanding.toFixed(2)}</div><div className="text-xs">Outstanding</div></div><div className="msh-stat-card py-3"><div className="text-lg font-bold">${statement.available.toFixed(2)}</div><div className="text-xs">Available credit</div></div></div>
            <div className="grid grid-cols-4 gap-2 text-xs mb-4">{(["current", "d30", "d60", "d90"] as const).map((key) => <div key={key} className="border rounded-lg p-2"><div className="uppercase text-[hsl(var(--muted-foreground))]">{key === "d90" ? "61+ overdue" : key === "current" ? "Not overdue" : key === "d30" ? "1–30 overdue" : "31–60 overdue"}</div><div className="font-semibold">${statement.aging[key].toFixed(2)}</div></div>)}</div>
            <form onSubmit={approveCredit} className="flex gap-2 mb-4"><input className="msh-input" type="number" min={statement.outstanding} step="0.01" aria-label="Approved credit limit" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} /><button disabled={busy} className="msh-btn">Approve limit</button></form>
            <form onSubmit={payNow} className="grid grid-cols-2 gap-2"><input className="msh-input" type="number" min="0.01" max={statement.outstanding} step="0.01" required aria-label="Payment amount" placeholder="Payment amount" value={pay} onChange={(e) => setPay(e.target.value)} /><input className="msh-input" placeholder="Payment reference" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} /><button disabled={busy || statement.outstanding <= 0} className="msh-btn msh-btn-primary col-span-2">Apply payment</button></form>
            <form onSubmit={postCharge} className="grid grid-cols-2 gap-2 mt-3 border-t pt-3"><input className="msh-input" type="number" min="0.01" step="0.01" required aria-label="Charge amount" placeholder="Charge amount" value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)} /><input className="msh-input" required placeholder="Charge reference" value={chargeReference} onChange={(e) => setChargeReference(e.target.value)} /><button disabled={busy || !statement.company.isActive || !statement.company.isCreditApproved} className="msh-btn col-span-2">Post charge to account</button></form>
          </>}
        </section>
      </div>

      {statement && <div className="grid lg:grid-cols-2 gap-6">
        <section className="msh-card p-4">
          <h2 className="font-semibold mb-2">Corporate billing routing</h2>
          <p className="text-xs text-slate-500 mb-3">Selected departments are charged to the corporate account at checkout. Reservations keep the routing that was active when they were created.</p>
          <form onSubmit={saveBillingRouting}>
            <div className="grid grid-cols-2 gap-2 mb-3">{[["ROOMS", "Room charges"], ["RESTAURANT", "Restaurant"], ["BAR", "Bar"], ["SERVICES", "Guest services"], ["OTHER", "Other charges"]].map(([value, label]) => <label key={value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={billingDepartments.includes(value!)} onChange={(e) => setBillingDepartments(e.target.checked ? [...billingDepartments, value!] : billingDepartments.filter((department) => department !== value))} />{label}</label>)}</div>
            <button disabled={busy} className="msh-btn">Save billing routing</button>
          </form>
        </section>
        <section className="msh-card p-4">
          <h2 className="font-semibold mb-3">Negotiated room rates</h2>
          <form onSubmit={createContract} className="grid sm:grid-cols-2 gap-2 mb-4">
            <select className="msh-input" required value={contractForm.roomTypeId} onChange={(e) => setContractForm({ ...contractForm, roomTypeId: e.target.value })}><option value="">Room type</option>{roomTypes.map((roomType) => <option key={roomType.id} value={roomType.id}>{roomType.name} ({roomType.code})</option>)}</select>
            <input className="msh-input" type="number" min="0.01" step="0.01" required placeholder="Contracted nightly rate" value={contractForm.contractedRate} onChange={(e) => setContractForm({ ...contractForm, contractedRate: e.target.value })} />
            <input className="msh-input" type="date" required value={contractForm.startDate} onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })} />
            <input className="msh-input" type="date" required value={contractForm.endDate} onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })} />
            <button disabled={busy || !statement.company.isActive} className="msh-btn msh-btn-primary sm:col-span-2">Add rate contract</button>
          </form>
          <ul className="text-sm divide-y">{statement.company.contracts.map((contract) => <li key={contract.id} className="py-2 flex justify-between gap-3"><span>{contract.roomType.name} ({contract.roomType.code}) · {contract.startDate.slice(0, 10)} to {contract.endDate.slice(0, 10)}</span><span>${Number(contract.contractedRate).toFixed(2)} · {contract.isActive ? "Active" : "Inactive"}</span></li>)}{!statement.company.contracts.length && <li className="py-2 text-slate-500">No rate contracts.</li>}</ul>
        </section>
        <section className="msh-card p-4">
          <h2 className="font-semibold mb-3">Corporate invoices</h2>
          <div className="max-h-64 overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-white"><tr><th className="py-2 text-left">Invoice</th><th className="py-2 text-left">Due</th><th className="py-2 text-left">Status</th><th className="py-2 text-right">Outstanding</th></tr></thead><tbody>{statement.company.invoices.map((invoice) => <tr key={invoice.id} className="border-t"><td className="py-2 pr-2">{invoice.invoiceNumber}<div className="text-xs text-slate-500">{invoice.referenceDetails || "Account charge"}</div></td><td className="py-2 pr-2">{invoice.dueDate.slice(0, 10)}</td><td className="py-2 pr-2">{invoice.status}</td><td className="py-2 text-right">${Number(invoice.outstanding).toFixed(2)}</td></tr>)}{!statement.company.invoices.length && <tr><td colSpan={4} className="py-2 text-slate-500">No invoices.</td></tr>}</tbody></table></div>
        </section>
        <section className="msh-card p-4">
          <h2 className="font-semibold mb-3">Account ledger</h2>
          <div className="max-h-80 overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-white"><tr><th className="py-2 text-left">Date</th><th className="py-2 text-left">Entry</th><th className="py-2 text-right">Amount</th><th className="py-2 text-right">Balance</th></tr></thead><tbody>{[...statement.company.creditTransactions].reverse().map((tx) => <tr key={tx.id} className="border-t"><td className="py-2 pr-2">{new Date(tx.createdAt).toLocaleDateString()}</td><td className="py-2 pr-2">{tx.referenceDetails || tx.transactionType.replaceAll("_", " ")}</td><td className="py-2 text-right">{tx.transactionType === "CREDIT_PAYMENT" ? "−" : ""}${Number(tx.amount).toFixed(2)}</td><td className="py-2 text-right">${Number(tx.balanceAfter).toFixed(2)}</td></tr>)}{!statement.company.creditTransactions.length && <tr><td colSpan={4} className="py-2 text-slate-500">No transactions.</td></tr>}</tbody></table></div>
        </section>
      </div>}
    </div>
  );
}
