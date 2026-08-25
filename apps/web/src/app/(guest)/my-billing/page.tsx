"use client";

import { useEffect, useState } from "react";
import { GuestGate } from "@/components/portal/GuestGate";
import { guestApiFetch } from "@/lib/guest-api";
import { formatLongDate, formatMoney } from "@/lib/portal";

interface Billing {
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
  invoices: { id: string; invoiceNumber: string; issuedDate: string; totalAmount: number; status: string; reservationNumber: string }[];
  payments: { id: string; amount: number; paymentMethod: string | null; paymentDate: string; reservationNumber: string }[];
}

function BillingBody() {
  const [data, setData] = useState<Billing | null>(null);
  const [tab, setTab] = useState<"invoices" | "payments">("invoices");
  const [query, setQuery] = useState("");

  useEffect(() => {
    guestApiFetch<Billing>("/api/guest/billing")
      .then(setData)
      .catch(() => setData({ totalBilled: 0, totalPaid: 0, outstanding: 0, invoices: [], payments: [] }));
  }, []);

  if (!data) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;

  const invoices = data.invoices.filter((i) => !query || i.invoiceNumber.toLowerCase().includes(query.toLowerCase()));
  const payments = data.payments.filter((p) => !query || (p.paymentMethod || "").toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-display font-bold mb-1">Billing</h1>
      <p className="text-sm text-muted-foreground mb-6">Your invoices and payment history.</p>
      <div className="grid grid-cols-3 gap-4 mb-6 max-w-xl">
        <Stat label="Total Billed" value={formatMoney(data.totalBilled)} />
        <Stat label="Paid" value={formatMoney(data.totalPaid)} />
        <Stat label="Outstanding" value={formatMoney(data.outstanding)} />
      </div>
      <div className="flex gap-4 mb-4 text-sm font-medium border-b">
        <button type="button" className={`pb-2 ${tab === "invoices" ? "text-primary border-b-2 border-accent" : "text-muted-foreground"}`} onClick={() => setTab("invoices")}>Invoices</button>
        <button type="button" className={`pb-2 ${tab === "payments" ? "text-primary border-b-2 border-accent" : "text-muted-foreground"}`} onClick={() => setTab("payments")}>Payments</button>
      </div>
      <input className="msh-input max-w-sm mb-4" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {tab === "invoices" ? (
        invoices.length === 0 ? (
          <p className="text-muted-foreground py-8">No invoices yet.</p>
        ) : (
          <div className="space-y-3">
            {invoices.map((inv) => (
              <div key={inv.id} className="rounded-lg border bg-card p-4 flex justify-between gap-3">
                <div>
                  <p className="font-medium">{inv.invoiceNumber}</p>
                  <p className="text-sm text-muted-foreground">{inv.reservationNumber} · {formatLongDate(inv.issuedDate)}</p>
                </div>
                <p className="font-display font-semibold">{formatMoney(inv.totalAmount)}</p>
              </div>
            ))}
          </div>
        )
      ) : payments.length === 0 ? (
        <p className="text-muted-foreground py-8">No payments recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {payments.map((p) => (
            <div key={p.id} className="rounded-lg border bg-card p-4 flex justify-between gap-3">
              <div>
                <p className="font-medium capitalize">{(p.paymentMethod || "Payment").replace("_", " ")}</p>
                <p className="text-sm text-muted-foreground">{p.reservationNumber} · {formatLongDate(p.paymentDate)}</p>
              </div>
              <p className="font-display font-semibold">{formatMoney(p.amount)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 text-center">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-lg font-bold font-display">{value}</p>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <GuestGate next="/my-billing">
      <BillingBody />
    </GuestGate>
  );
}
