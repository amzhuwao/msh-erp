"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Metrics { occupancyPercent: number; adr: number; revpar: number; roomRevenue: number }
interface RoomType { id: string; code: string; name: string }

export default function RevenuePage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [types, setTypes] = useState<RoomType[]>([]);
  const [calc, setCalc] = useState<{ rate: number; occupancyPercent: number; yieldApplied: number } | null>(null);
  const [promo, setPromo] = useState("SUMMER26");
  const [roomTypeId, setRoomTypeId] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    apiFetch<Metrics>(`/api/revenue/metrics?startDate=${today}&endDate=${today}`).then(setMetrics);
    apiFetch<{ items: { roomType: RoomType }[] }>("/api/rooms").then((d) => {
      const unique = new Map<string, RoomType>();
      for (const r of d.items as { roomType: RoomType }[]) unique.set(r.roomType.id, r.roomType);
      const list = [...unique.values()];
      setTypes(list);
      if (list[0]) setRoomTypeId(list[0].id);
    });
  }, [today]);

  async function calculate() {
    const q = new URLSearchParams({ roomTypeId, date: today, promoCode: promo, nights: "2" });
    setCalc(await apiFetch<{ rate: number; occupancyPercent: number; yieldApplied: number }>(`/api/revenue/calculate-rate?${q}`));
  }

  return (
    <div className="p-6">
      <PageHeader title="Revenue Management" description="ADR, RevPAR, occupancy yield rules, and promotional codes" />
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="msh-stat-card"><div className="text-2xl font-bold text-[hsl(var(--primary))]">{metrics.occupancyPercent}%</div><div className="text-xs text-[hsl(var(--muted-foreground))]">Occupancy</div></div>
          <div className="msh-stat-card"><div className="text-2xl font-bold text-[hsl(var(--primary))]">${metrics.adr.toFixed(2)}</div><div className="text-xs text-[hsl(var(--muted-foreground))]">ADR</div></div>
          <div className="msh-stat-card"><div className="text-2xl font-bold text-[hsl(var(--primary))]">${metrics.revpar.toFixed(2)}</div><div className="text-xs text-[hsl(var(--muted-foreground))]">RevPAR</div></div>
          <div className="msh-stat-card"><div className="text-2xl font-bold text-[hsl(var(--primary))]">${metrics.roomRevenue.toFixed(2)}</div><div className="text-xs text-[hsl(var(--muted-foreground))]">Room revenue</div></div>
        </div>
      )}
      <section className="msh-card p-4">
        <h2 className="font-semibold mb-3">Rate calculator</h2>
        <div className="flex gap-2 flex-wrap">
          <select className="msh-input max-w-xs" value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input className="msh-input max-w-[160px]" value={promo} onChange={(e) => setPromo(e.target.value)} />
          <button className="msh-btn msh-btn-primary" onClick={calculate}>Calculate</button>
        </div>
        {calc && (
          <p className="mt-4 text-sm">Final rate <strong>${calc.rate.toFixed(2)}</strong> · occupancy {calc.occupancyPercent}% · yield {calc.yieldApplied}</p>
        )}
      </section>
    </div>
  );
}
