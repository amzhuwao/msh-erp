"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { FolioPanel } from "./FolioPanel";

interface Departure {
  id: string;
  reservationNumber: string;
  folioBalance: number;
  guest: { firstName: string; lastName: string };
  room: { number: string } | null;
  folios: { id: string }[];
}

export function DeparturesTab() {
  const [items, setItems] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(true);
  const [folioId, setFolioId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  function load() {
    setLoading(true);
    apiFetch<{ items: Departure[] }>("/api/front-office/departures")
      .then((d) => setItems(d.items))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  async function handleCheckout(id: string) {
    try {
      await apiFetch(`/api/reservations/${id}/checkout`, { method: "POST" });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Check-out failed");
    }
  }

  if (loading) return <div className="text-slate-500 p-8 text-center">Loading departures…</div>;

  if (folioId) {
    return <FolioPanel folioId={folioId} onClose={() => { setFolioId(null); load(); }} />;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-[#0f2744] mb-4">Expected Departures Today</h2>
      {items.length === 0 ? (
        <p className="text-slate-500">No departures scheduled for today.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="py-2 pr-4">Guest</th>
              <th className="py-2 pr-4">Room</th>
              <th className="py-2 pr-4">Folio Balance</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-3 pr-4 font-medium">
                  {item.guest.firstName} {item.guest.lastName}
                </td>
                <td className="py-3 pr-4">{item.room?.number ?? "—"}</td>
                <td className="py-3 pr-4">
                  <span className={item.folioBalance > 0 ? "text-red-600 font-semibold" : "text-emerald-600"}>
                    ${item.folioBalance.toFixed(2)}
                  </span>
                </td>
                <td className="py-3 flex gap-2">
                  {item.folios[0] && (
                    <button
                      onClick={() => setFolioId(item.folios[0]!.id)}
                      className="border border-slate-200 px-3 py-1.5 rounded text-xs hover:bg-slate-50"
                    >
                      View Folio
                    </button>
                  )}
                  <button
                    onClick={() => handleCheckout(item.id)}
                    disabled={Math.abs(item.folioBalance) > 0.01}
                    className="bg-[#0f2744] text-white px-3 py-1.5 rounded text-xs hover:bg-[#1a3a5c] disabled:opacity-40"
                  >
                    Check Out
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
