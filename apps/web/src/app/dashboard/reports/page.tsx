"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Dash {
  arrivals: number;
  metrics: { occupancyPercent: number; adr: number; revpar: number };
  pnl: { totalRevenue: number; netIncome: number };
  trial: { asOf: string };
}

export default function ReportsPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [custom, setCustom] = useState<unknown>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    apiFetch<Dash>("/api/reports/dashboard").then(setDash);
  }, []);

  async function build(dataset: "arrivals" | "inventory" | "trial-balance" | "revenue") {
    setCustom(await apiFetch("/api/reports/custom/build", {
      method: "POST",
      body: JSON.stringify({ dataset, date: today, startDate: today, endDate: today }),
    }));
  }

  return (
    <div className="p-6">
      <PageHeader title="Reporting & BI" description="Operational, financial, inventory, and revenue reports — read only" />
      {dash && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="msh-stat-card"><div className="text-2xl font-bold">{dash.arrivals}</div><div className="text-xs">Arrivals today</div></div>
          <div className="msh-stat-card"><div className="text-2xl font-bold">{dash.metrics.occupancyPercent}%</div><div className="text-xs">Occupancy</div></div>
          <div className="msh-stat-card"><div className="text-2xl font-bold">${dash.metrics.adr.toFixed(2)}</div><div className="text-xs">ADR</div></div>
          <div className="msh-stat-card"><div className="text-2xl font-bold">${dash.pnl.netIncome.toFixed(2)}</div><div className="text-xs">Net income</div></div>
        </div>
      )}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(["arrivals", "inventory", "trial-balance", "revenue"] as const).map((d) => (
          <button key={d} className="msh-btn msh-btn-outline" onClick={() => build(d)}>{d}</button>
        ))}
      </div>
      {custom !== null && (
        <pre className="msh-card p-4 text-xs overflow-auto max-h-[480px]">{JSON.stringify(custom, null, 2)}</pre>
      )}
    </div>
  );
}
