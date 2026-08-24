"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { FolioPanel } from "./FolioPanel";

interface Checkout {
  id: string;
  reservationNumber: string;
  guest: { firstName: string; lastName: string };
  room: { number: string } | null;
  folios: { id: string }[];
}

export function RecheckInTab() {
  const [items, setItems] = useState<Checkout[]>([]);
  const [rooms, setRooms] = useState<{ id: string; number: string; status: string }[]>([]);
  const [roomId, setRoomId] = useState("");
  const [folioId, setFolioId] = useState<string | null>(null);

  function load() {
    apiFetch<{ items: Checkout[] }>("/api/front-office/recent-checkouts").then((d) => setItems(d.items));
    apiFetch<{ items: { id: string; number: string; status: string }[] }>("/api/rooms")
      .then((d) => setRooms(d.items.filter((r) => r.status === "INSPECTED" || r.status === "VACANT_CLEAN" || r.status === "OCCUPIED_DIRTY")));
  }
  useEffect(() => { load(); }, []);

  async function recheck(id: string) {
    try {
      await apiFetch(`/api/reservations/${id}/recheckin`, {
        method: "POST",
        body: JSON.stringify({ roomId: roomId || undefined }),
      });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Recheck-in failed");
    }
  }

  if (folioId) {
    return <FolioPanel folioId={folioId} onClose={() => { setFolioId(null); load(); }} />;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-[hsl(var(--primary))] mb-4">Recheck-in checked-out guests</h2>
      <select className="msh-input mb-4 max-w-xs" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
        <option value="">Use original room</option>
        {rooms.map((r) => <option key={r.id} value={r.id}>Room {r.number} ({r.status})</option>)}
      </select>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="py-2">Guest</th><th className="py-2">Reservation</th><th className="py-2">Last room</th><th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="py-3">{item.guest.firstName} {item.guest.lastName}</td>
              <td className="py-3 font-mono text-xs">{item.reservationNumber}</td>
              <td className="py-3">{item.room?.number ?? "—"}</td>
              <td className="py-3 flex gap-2">
                {item.folios[0] && <button className="text-xs" onClick={() => setFolioId(item.folios[0]!.id)}>Folio</button>}
                <button className="msh-btn msh-btn-primary text-xs" onClick={() => recheck(item.id)}>Recheck in</button>
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td className="py-6 text-slate-500" colSpan={4}>No recent check-outs.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
