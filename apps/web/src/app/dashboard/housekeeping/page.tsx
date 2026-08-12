"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Room {
  id: string;
  number: string;
  floor: number;
  status: string;
  roomType: { code: string; name: string };
  reservations: { guest: { lastName: string } }[];
}

const nextStatus: Record<string, { label: string; status: string }[]> = {
  VACANT_DIRTY: [{ label: "Start Cleaning", status: "CLEANING_IN_PROGRESS" }],
  OCCUPIED_DIRTY: [{ label: "Start Cleaning", status: "CLEANING_IN_PROGRESS" }],
  CLEANING_IN_PROGRESS: [{ label: "Mark Clean", status: "VACANT_CLEAN" }],
  VACANT_CLEAN: [{ label: "Inspect ✓", status: "INSPECTED" }, { label: "Reject", status: "VACANT_DIRTY" }],
};

const statusBadge: Record<string, string> = {
  INSPECTED: "bg-emerald-100 text-emerald-800",
  VACANT_CLEAN: "bg-blue-100 text-blue-800",
  CLEANING_IN_PROGRESS: "bg-amber-100 text-amber-800",
  VACANT_DIRTY: "bg-orange-100 text-orange-800",
  OCCUPIED_DIRTY: "bg-red-100 text-red-800",
  OCCUPIED: "bg-purple-100 text-purple-800",
  OUT_OF_ORDER: "bg-slate-200 text-slate-600",
};

export default function HousekeepingPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<string>("ALL");

  function load() {
    apiFetch<{ rooms: Room[]; summary: Record<string, number> }>("/api/housekeeping/dashboard")
      .then((d) => { setRooms(d.rooms); setSummary(d.summary); })
      .catch(console.error);
  }

  useEffect(() => { load(); }, []);

  async function updateStatus(roomId: string, status: string) {
    try {
      await apiFetch(`/api/housekeeping/rooms/${roomId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed");
    }
  }

  const filtered = filter === "ALL" ? rooms : rooms.filter((r) => r.status === filter);

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0f2744]">Housekeeping</h1>
        <p className="text-slate-500 text-sm mt-1">Room status grid & cleaning workflow</p>
      </header>

      <div className="flex flex-wrap gap-2 mb-6">
        <FilterChip label="All" count={rooms.length} active={filter === "ALL"} onClick={() => setFilter("ALL")} />
        {Object.entries(summary).map(([status, count]) => (
          <FilterChip
            key={status}
            label={status.replace(/_/g, " ")}
            count={count}
            active={filter === status}
            onClick={() => setFilter(status)}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {filtered.map((room) => (
          <div key={room.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg font-bold text-[#0f2744]">{room.number}</span>
              <span className="text-xs text-slate-400">F{room.floor}</span>
            </div>
            <div className="text-xs text-slate-500 mb-2">{room.roomType.code}</div>
            <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${statusBadge[room.status] ?? "bg-slate-100"}`}>
              {room.status.replace(/_/g, " ")}
            </span>
            {room.reservations[0] && (
              <div className="text-[10px] text-slate-400 mt-1 truncate">
                Guest: {room.reservations[0].guest.lastName}
              </div>
            )}
            <div className="mt-2 space-y-1">
              {(nextStatus[room.status] ?? []).map((action) => (
                <button
                  key={action.status}
                  onClick={() => updateStatus(room.id, action.status)}
                  className="w-full text-[10px] bg-[#0f2744] text-white py-1 rounded hover:bg-[#1a3a5c]"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
        active ? "bg-[#0f2744] text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
      }`}
    >
      {label} ({count})
    </button>
  );
}
