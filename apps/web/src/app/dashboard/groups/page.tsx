"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

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
      <div className="flex items-start justify-between gap-4 mb-6">
        <PageHeader
          title="Group Reservations"
          description="Manage block bookings, rooming lists, and allocations"
        />
        <Link href="/dashboard/groups/new" className="msh-btn msh-btn-primary shrink-0 mt-1">
          New Group Booking
        </Link>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Tentative", value: stats.tentative },
            { label: "Confirmed", value: stats.confirmed },
            { label: "Arrivals Today", value: stats.arrivalsToday },
            { label: "Departures Today", value: stats.departuresToday },
            { label: "Cancelled", value: stats.cancelled },
          ].map((s) => (
            <div key={s.label} className="msh-stat-card py-3">
              <div className="text-xl font-bold text-[hsl(var(--primary))]">{s.value}</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {["", "TENTATIVE", "CONFIRMED", "CANCELLED"].map((s) => (
          <button
            key={s || "ALL"}
            onClick={() => setFilter(s)}
            className={`msh-badge ${
              filter === s
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "bg-white border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"
            }`}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      <div className="msh-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] text-left">
            <tr>
              <th className="p-3 font-medium">Code</th>
              <th className="p-3 font-medium">Group</th>
              <th className="p-3 font-medium">Company</th>
              <th className="p-3 font-medium">Dates</th>
              <th className="p-3 font-medium">Rooms</th>
              <th className="p-3 font-medium">Guests</th>
              <th className="p-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.id} className="border-t border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.5)]">
                <td className="p-3">
                  <Link
                    href={`/dashboard/groups/${g.id}`}
                    className="font-mono text-[hsl(var(--accent))] hover:underline"
                  >
                    {g.groupCode}
                  </Link>
                </td>
                <td className="p-3 font-medium">{g.groupName}</td>
                <td className="p-3 text-[hsl(var(--muted-foreground))]">{g.company?.companyName ?? "—"}</td>
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
          <p className="text-center text-[hsl(var(--muted-foreground))] py-12">No group reservations found.</p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    TENTATIVE: "bg-amber-100 text-amber-800",
    CONFIRMED: "bg-emerald-100 text-emerald-800",
    CLOSED: "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
    CANCELLED: "bg-red-100 text-red-800",
  };
  return (
    <span className={`msh-badge ${colors[status] ?? "bg-[hsl(var(--muted))]"}`}>
      {status}
    </span>
  );
}
