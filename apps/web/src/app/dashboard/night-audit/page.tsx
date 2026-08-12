"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

interface AuditResult {
  businessDate: string;
  exceptions: {
    pendingDepartures: { guest: { lastName: string }; room: { number: string } | null }[];
    pendingArrivals: number;
  };
  actions: { noShowCount: number; roomChargesPosted: number };
}

export default function NightAuditPage() {
  const [result, setResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function runAudit() {
    if (!confirm("Run night audit? This will mark no-shows and post room charges.")) return;
    setLoading(true);
    try {
      const data = await apiFetch<AuditResult>("/api/night-audit/run", { method: "POST" });
      setResult(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Night audit failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0f2744]">Night Audit</h1>
        <p className="text-slate-500 text-sm mt-1">
          Close the business day — validate departures/arrivals, post room charges, mark no-shows.
        </p>
      </header>

      <button
        onClick={runAudit}
        disabled={loading}
        className="bg-[#0f2744] text-white px-6 py-3 rounded-xl font-medium hover:bg-[#1a3a5c] disabled:opacity-60"
      >
        {loading ? "Running audit…" : "Run Night Audit"}
      </button>

      {result && (
        <div className="mt-8 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-[#0f2744]">Audit Results — {result.businessDate}</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-amber-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-amber-700">{result.exceptions.pendingDepartures.length}</div>
              <div className="text-amber-600">Pending departures</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-blue-700">{result.actions.noShowCount}</div>
              <div className="text-blue-600">Marked no-show</div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-emerald-700">{result.actions.roomChargesPosted}</div>
              <div className="text-emerald-600">Room charges posted</div>
            </div>
          </div>
          {result.exceptions.pendingDepartures.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-600 mb-2">Departure exceptions</h3>
              <ul className="text-sm space-y-1">
                {result.exceptions.pendingDepartures.map((d, i) => (
                  <li key={i} className="text-red-600">
                    Room {d.room?.number ?? "?"} — {d.guest.lastName} (still in-house)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
