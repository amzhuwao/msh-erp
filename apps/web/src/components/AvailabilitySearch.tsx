"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

interface AvailabilityResult {
  roomTypeId: string;
  code: string;
  name: string;
  availableCount: number;
  nightlyRate: string;
  ratePlanId: string;
}

export function AvailabilitySearch() {
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState(2);
  const [results, setResults] = useState<AvailabilityResult[]>([]);
  const [loading, setLoading] = useState(false);

  async function search() {
    if (!checkIn || !checkOut) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ results: AvailabilityResult[] }>(
        `/api/reservations/availability?checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}`,
      );
      setResults(data.results);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-[#0f2744] mb-4">Room Availability</h2>
      <div className="flex flex-wrap gap-3 mb-6">
        <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        <input type="number" min={1} className="border rounded-lg px-3 py-2 text-sm w-20" value={adults} onChange={(e) => setAdults(Number(e.target.value))} />
        <button onClick={search} disabled={loading} className="bg-[#0f2744] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#1a3a5c] disabled:opacity-60">
          {loading ? "Searching…" : "Search"}
        </button>
      </div>
      {results.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {results.map((r) => (
            <div key={r.roomTypeId} className="border border-slate-200 rounded-xl p-4">
              <div className="font-semibold text-[#0f2744]">{r.name}</div>
              <div className="text-sm text-slate-500 mt-1">{r.code} · {r.availableCount} rooms available</div>
              <div className="text-lg font-bold text-[#c9a227] mt-2">${Number(r.nightlyRate).toFixed(2)}<span className="text-sm font-normal text-slate-400">/night</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
