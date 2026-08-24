"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Profile {
  id: string; companyName: string; contactName: string; creditLimit: string;
  currentOutstanding: string; isCreditApproved: boolean; isActive: boolean;
}

interface Statement {
  outstanding: number;
  creditLimit: number;
  available: number;
  aging: { current: number; d30: number; d60: number; d90: number };
}

export default function CorporatePage() {
  const [items, setItems] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [statement, setStatement] = useState<Statement | null>(null);
  const [pay, setPay] = useState(0);

  function load() {
    apiFetch<{ items: Profile[] }>("/api/corporate/profiles").then((d) => setItems(d.items));
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!selected) return;
    apiFetch<Statement>(`/api/corporate/profiles/${selected}/statement`).then(setStatement);
  }, [selected]);

  async function payNow() {
    if (!selected) return;
    await apiFetch("/api/corporate/payments", { method: "POST", body: JSON.stringify({ companyId: selected, amount: Number(pay), referenceDetails: "UI payment" }) });
    load();
    apiFetch<Statement>(`/api/corporate/profiles/${selected}/statement`).then(setStatement);
  }

  return (
    <div className="p-6">
      <PageHeader title="Corporate Clients" description="Credit limits, negotiated rates, statements, and AR aging" />
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="msh-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[hsl(var(--muted))] text-left text-[hsl(var(--muted-foreground))]">
              <tr><th className="p-3">Company</th><th className="p-3">Limit</th><th className="p-3">Outstanding</th></tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className={`border-t cursor-pointer ${selected === c.id ? "bg-[hsl(var(--muted))]" : ""}`} onClick={() => setSelected(c.id)}>
                  <td className="p-3">{c.companyName}</td>
                  <td className="p-3">${Number(c.creditLimit).toFixed(0)}</td>
                  <td className="p-3">${Number(c.currentOutstanding).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="msh-card p-4">
          <h2 className="font-semibold mb-3">Statement & aging</h2>
          {!statement && <p className="text-sm text-[hsl(var(--muted-foreground))]">Select a company.</p>}
          {statement && (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="msh-stat-card py-3"><div className="text-lg font-bold">${statement.outstanding.toFixed(2)}</div><div className="text-xs">Outstanding</div></div>
                <div className="msh-stat-card py-3"><div className="text-lg font-bold">${statement.available.toFixed(2)}</div><div className="text-xs">Available credit</div></div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs mb-4">
                {(["current", "d30", "d60", "d90"] as const).map((k) => (
                  <div key={k} className="border rounded-lg p-2">
                    <div className="uppercase text-[hsl(var(--muted-foreground))]">{k}</div>
                    <div className="font-semibold">${statement.aging[k].toFixed(0)}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input className="msh-input" type="number" value={pay} onChange={(e) => setPay(Number(e.target.value))} />
                <button className="msh-btn msh-btn-primary" onClick={payNow}>Apply payment</button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
