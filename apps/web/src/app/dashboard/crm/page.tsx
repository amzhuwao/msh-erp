"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Lead {
  id: string; contactPerson: string; email: string; companyName: string | null;
  pipelineStage: string; estimatedValue: string;
}

const stages = ["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;

export default function CrmPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [form, setForm] = useState({ contactPerson: "", email: "", companyName: "", estimatedValue: 0 });

  function load() {
    apiFetch<{ items: Lead[] }>("/api/crm/leads").then((d) => setLeads(d.items));
  }
  useEffect(() => { load(); }, []);

  async function create() {
    await apiFetch("/api/crm/leads", { method: "POST", body: JSON.stringify({ ...form, estimatedValue: Number(form.estimatedValue) }) });
    setForm({ contactPerson: "", email: "", companyName: "", estimatedValue: 0 });
    load();
  }
  async function move(id: string, stage: string) {
    await apiFetch(`/api/crm/leads/${id}/stage`, { method: "PUT", body: JSON.stringify({ stage }) });
    load();
  }

  return (
    <div className="p-6">
      <PageHeader title="Sales & CRM" description="Lead pipeline, activities, loyalty, and guest feedback" />
      <section className="msh-card p-4 mb-6">
        <h2 className="font-semibold mb-3">New lead</h2>
        <div className="grid md:grid-cols-4 gap-2">
          <input className="msh-input" placeholder="Contact" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
          <input className="msh-input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="msh-input" placeholder="Company" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          <button className="msh-btn msh-btn-primary" onClick={create}>Add lead</button>
        </div>
      </section>
      <div className="grid md:grid-cols-3 xl:grid-cols-6 gap-3">
        {stages.map((stage) => (
          <div key={stage} className="msh-card p-3 min-h-[200px]">
            <div className="text-xs font-semibold text-[hsl(var(--accent))] mb-2">{stage}</div>
            {leads.filter((l) => l.pipelineStage === stage).map((l) => (
              <div key={l.id} className="border border-[hsl(var(--border))] rounded-lg p-2 mb-2 text-sm bg-white">
                <div className="font-medium">{l.contactPerson}</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">{l.companyName ?? l.email}</div>
                <div className="text-xs mt-1">${Number(l.estimatedValue).toFixed(0)}</div>
                <select className="mt-2 text-xs w-full border rounded px-1 py-0.5" value={stage} onChange={(e) => move(l.id, e.target.value)}>
                  {stages.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
