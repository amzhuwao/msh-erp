"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface InHouse {
  id: string;
  reservationNumber: string;
  guest: { firstName: string; lastName: string; email: string };
  room: { number: string; roomType: { name: string } } | null;
  checkOutDate: string;
}

export function InHouseTab() {
  const [items, setItems] = useState<InHouse[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [search]);

  function load() {
    setLoading(true);
    const q = search ? `?search=${encodeURIComponent(search)}` : "";
    apiFetch<{ items: InHouse[] }>(`/api/front-office/in-house${q}`)
      .then((d) => setItems(d.items))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#0f2744]">In-House Guests</h2>
        <input
          placeholder="Search by name or room…"
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {loading ? (
        <div className="text-slate-500 p-8 text-center">Searching…</div>
      ) : items.length === 0 ? (
        <p className="text-slate-500">No in-house guests found.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="py-2 pr-4">Room</th>
              <th className="py-2 pr-4">Guest</th>
              <th className="py-2 pr-4">Room Type</th>
              <th className="py-2">Check-Out</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-3 pr-4 font-semibold text-[#0f2744]">
                  {item.room?.number ?? "—"}
                </td>
                <td className="py-3 pr-4">
                  <div className="font-medium">{item.guest.firstName} {item.guest.lastName}</div>
                  <div className="text-xs text-slate-400">{item.guest.email}</div>
                </td>
                <td className="py-3 pr-4">{item.room?.roomType.name}</td>
                <td className="py-3">{item.checkOutDate.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
