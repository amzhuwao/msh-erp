"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Arrival {
  id: string;
  reservationNumber: string;
  checkInDate: string;
  status: string;
  guest: { firstName: string; lastName: string; phone?: string };
  room: { number: string; roomType: { name: string } } | null;
  ratePlan: { name: string };
}

export function ArrivalsTab() {
  const [items, setItems] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkinId, setCheckinId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState("");
  const [rooms, setRooms] = useState<{ id: string; number: string; status: string }[]>([]);

  useEffect(() => {
    load();
    apiFetch<{ items: { id: string; number: string; status: string }[] }>("/api/rooms")
      .then((d) => setRooms(d.items.filter((r) => r.status === "INSPECTED")))
      .catch(console.error);
  }, []);

  function load() {
    setLoading(true);
    apiFetch<{ items: Arrival[] }>("/api/front-office/arrivals")
      .then((d) => setItems(d.items))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  async function handleCheckIn() {
    if (!checkinId || !roomId) return;
    try {
      await apiFetch(`/api/reservations/${checkinId}/checkin`, {
        method: "POST",
        body: JSON.stringify({ roomId, nationalId: "PENDING" }),
      });
      setCheckinId(null);
      setRoomId("");
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Check-in failed");
    }
  }

  if (loading) return <div className="text-slate-500 p-8 text-center">Loading arrivals…</div>;

  return (
    <div>
      <h2 className="text-lg font-semibold text-[hsl(var(--primary))] mb-4">Expected Arrivals Today</h2>
      {items.length === 0 ? (
        <p className="text-slate-500">No arrivals scheduled for today.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="py-2 pr-4">Guest</th>
              <th className="py-2 pr-4">Reservation</th>
              <th className="py-2 pr-4">Room Type</th>
              <th className="py-2 pr-4">Room</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-[hsl(var(--border))]">
                <td className="py-3 pr-4">
                  <div className="font-medium">{item.guest.firstName} {item.guest.lastName}</div>
                  <div className="text-xs text-slate-400">{item.guest.phone}</div>
                </td>
                <td className="py-3 pr-4 font-mono text-xs">{item.reservationNumber}</td>
                <td className="py-3 pr-4">{item.ratePlan.name}</td>
                <td className="py-3 pr-4">{item.room?.number ?? "—"}</td>
                <td className="py-3">
                  {checkinId === item.id ? (
                    <div className="flex gap-2 items-center">
                      <select
                        className="border rounded px-2 py-1 text-xs"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                      >
                        <option value="">Select room</option>
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>Room {r.number}</option>
                        ))}
                      </select>
                      <button onClick={handleCheckIn} className="bg-emerald-600 text-white px-3 py-1 rounded text-xs">
                        Confirm
                      </button>
                      <button onClick={() => setCheckinId(null)} className="text-slate-400 text-xs">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCheckinId(item.id)}
                      className="bg-[hsl(var(--primary))] text-white px-3 py-1.5 rounded text-xs hover:opacity-90"
                    >
                      Check In
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
