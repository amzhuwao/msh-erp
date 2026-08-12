"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { TapeChart } from "@/components/TapeChart";
import { ArrivalsTab } from "@/components/ArrivalsTab";
import { DeparturesTab } from "@/components/DeparturesTab";
import { InHouseTab } from "@/components/InHouseTab";
import { AvailabilitySearch } from "@/components/AvailabilitySearch";
import { PageHeader } from "@/components/ui/PageHeader";

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
      <PageHeader
        title="Front Office Dashboard"
        description={stats ? `Business date: ${stats.date}` : "Loading property data…"}
      />

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Arrivals Today" value={stats.arrivalsToday} />
          <StatCard label="Departures Today" value={stats.departuresToday} />
          <StatCard label="In-House Guests" value={stats.inHouseGuests} />
          <StatCard
            label="Inspected Rooms"
            value={stats.roomStatusBreakdown.find((r) => r.status === "INSPECTED")?._count.status ?? 0}
          />
        </div>
      )}

      <div className="flex gap-1 border-b border-[hsl(var(--border))] mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`msh-tab whitespace-nowrap ${activeTab === tab ? "msh-tab-active" : ""}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="msh-card p-4 md:p-5 min-h-[480px]">
        {activeTab === "Tape Chart" && <TapeChart />}
        {activeTab === "Arrivals" && <ArrivalsTab />}
        {activeTab === "Departures" && <DeparturesTab />}
        {activeTab === "In-House" && <InHouseTab />}
        {activeTab === "Availability" && <AvailabilitySearch />}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="msh-stat-card">
      <div className="text-2xl font-bold text-[hsl(var(--primary))]">{value}</div>
      <div className="text-xs font-medium mt-1 text-[hsl(var(--muted-foreground))]">{label}</div>
    </div>
  );
}
