"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { TapeChart } from "@/components/TapeChart";
import { ArrivalsTab } from "@/components/ArrivalsTab";
import { DeparturesTab } from "@/components/DeparturesTab";
import { InHouseTab } from "@/components/InHouseTab";
import { AvailabilitySearch } from "@/components/AvailabilitySearch";

interface DashboardStats {
  date: string;
  arrivalsToday: number;
  departuresToday: number;
  inHouseGuests: number;
  roomStatusBreakdown: { status: string; _count: { status: number } }[];
}

const tabs = ["Tape Chart", "Arrivals", "Departures", "In-House", "Availability"] as const;

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Tape Chart");
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    apiFetch<DashboardStats>("/api/property/dashboard")
      .then(setStats)
      .catch(console.error);
  }, []);

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0f2744]">Front Office Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">
          {stats ? `Business date: ${stats.date}` : "Loading…"}
        </p>
      </header>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Arrivals Today" value={stats.arrivalsToday} color="bg-blue-50 text-blue-700" />
          <StatCard label="Departures Today" value={stats.departuresToday} color="bg-amber-50 text-amber-700" />
          <StatCard label="In-House Guests" value={stats.inHouseGuests} color="bg-emerald-50 text-emerald-700" />
          <StatCard
            label="Inspected Rooms"
            value={stats.roomStatusBreakdown.find((r) => r.status === "INSPECTED")?._count.status ?? 0}
            color="bg-violet-50 text-violet-700"
          />
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition ${
              activeTab === tab
                ? "bg-white text-[#0f2744] border border-b-white border-slate-200 -mb-px"
                : "text-slate-500 hover:text-[#0f2744]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 min-h-[480px]">
        {activeTab === "Tape Chart" && <TapeChart />}
        {activeTab === "Arrivals" && <ArrivalsTab />}
        {activeTab === "Departures" && <DeparturesTab />}
        {activeTab === "In-House" && <InHouseTab />}
        {activeTab === "Availability" && <AvailabilitySearch />}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl p-4 ${color}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium mt-1 opacity-80">{label}</div>
    </div>
  );
}
