"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface GroupItem {
  id: string;
  groupCode: string;
  groupName: string;
  contactPerson: string;
  arrivalDate: string;
  departureDate: string;
  roomCount: number;
  status: string;
  company: { companyName: string } | null;
  _count: { guests: number; roomAllocations: number };
}

interface DashboardStats {
  tentative: number;
  confirmed: number;
  arrivalsToday: number;
  departuresToday: number;
  cancelled: number;
}

export default function GroupsPage() {
  const [items, setItems] = useState<GroupItem[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const q = filter ? `?status=${filter}` : "";
    apiFetch<{ items: GroupItem[] }>(`/api/group-reservations${q}`).then((d) => setItems(d.items));
    apiFetch<DashboardStats>("/api/group-reservations/dashboard").then(setStats);
  }, [filter]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f2744]">Group Reservations</h1>
          <p className="text-slate-500 text-sm mt-1">Manage block bookings, rooming lists, and allocations</p>
        </div>
        <Link
          href="/dashboard/groups/new"
          className="bg-[#0f2744] text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[#1a3a5c]"
        >
          New Group Booking
        </Link>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Tentative", value: stats.tentative, color: "bg-slate-100 text-slate-700" },
            { label: "Confirmed", value: stats.confirmed, color: "bg-emerald-50 text-emerald-700" },
            { label: "Arrivals Today", value: stats.arrivalsToday, color: "bg-blue-50 text-blue-700" },
            { label: "Departures Today", value: stats.departuresToday, color: "bg-amber-50 text-amber-700" },
            { label: "Cancelled", value: stats.cancelled, color: "bg-red-50 text-red-700" },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl p-3 ${s.color}`}>
              <div className="text-xl font-bold">{s.value}</div>
              <div className="text-xs opacity-80">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {["", "TENTATIVE", "CONFIRMED", "CANCELLED"].map((s) => (
          <button
            key={s || "ALL"}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              filter === s ? "bg-[#0f2744] text-white" : "bg-white border border-slate-200 text-slate-600"
            }`}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="p-3">Code</th>
              <th className="p-3">Group</th>
              <th className="p-3">Company</th>
              <th className="p-3">Dates</th>
              <th className="p-3">Rooms</th>
              <th className="p-3">Guests</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3">
                  <Link href={`/dashboard/groups/${g.id}`} className="font-mono text-[#4a90a4] hover:underline">
                    {g.groupCode}
                  </Link>
                </td>
                <td className="p-3 font-medium">{g.groupName}</td>
                <td className="p-3 text-slate-500">{g.company?.companyName ?? "—"}</td>
                <td className="p-3 text-xs">
                  {g.arrivalDate.slice(0, 10)} → {g.departureDate.slice(0, 10)}
                </td>
                <td className="p-3">{g._count.roomAllocations}/{g.roomCount}</td>
                <td className="p-3">{g._count.guests}</td>
                <td className="p-3">
                  <StatusBadge status={g.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && (
          <p className="text-center text-slate-400 py-12">No group reservations found.</p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    TENTATIVE: "bg-amber-100 text-amber-800",
    CONFIRMED: "bg-emerald-100 text-emerald-800",
    CLOSED: "bg-slate-100 text-slate-600",
    CANCELLED: "bg-red-100 text-red-800",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? "bg-slate-100"}`}>
      {status}
    </span>
  );
}
