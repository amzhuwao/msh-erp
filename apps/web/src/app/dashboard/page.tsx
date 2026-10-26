"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { TapeChart } from "@/components/TapeChart";
import { ArrivalsTab } from "@/components/ArrivalsTab";
import { DeparturesTab } from "@/components/DeparturesTab";
import { InHouseTab } from "@/components/InHouseTab";
import { AvailabilitySearch } from "@/components/AvailabilitySearch";
import { GuestRegisterTab } from "@/components/GuestRegisterTab";
import { RecheckInTab } from "@/components/RecheckInTab";
import { ReservationCreateTab } from "@/components/ReservationCreateTab";
import { ReservationsTab } from "@/components/ReservationsTab";
import { PageHeader } from "@/components/ui/PageHeader";

interface DashboardStats {
  date: string;
  arrivalsToday: number;
  departuresToday: number;
  inHouseGuests: number;
  roomStatusBreakdown: { status: string; _count: { status: number } }[];
}

interface OverdueServiceAlert {
  id: string;
  serviceNumber: string;
  overdueMinutes: number;
  reservation: { guest: { firstName: string; lastName: string }; room: { number: string } | null };
  specialInstructions: string | null;
}

const tabs = ["Tape Chart", "Reservations", "Arrivals", "Departures", "In-House", "Recheck-in", "Register", "New Reservation", "Availability"] as const;

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Tape Chart");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [serviceAlerts, setServiceAlerts] = useState<OverdueServiceAlert[]>([]);

  useEffect(() => {
    apiFetch<DashboardStats>("/api/property/dashboard")
      .then(setStats)
      .catch(console.error);
    apiFetch<{ items: OverdueServiceAlert[] }>("/api/services/overdue-alerts")
      .then((result) => setServiceAlerts(result.items))
      .catch(() => undefined);
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

      {serviceAlerts.length > 0 && (
        <section role="alert" className="mb-6 rounded-xl border-2 border-red-400 bg-red-50 p-4 text-red-900">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold">Overdue high-priority concierge requests</h2>
            <a className="text-sm font-semibold underline" href="/dashboard/services">Open Guest Services</a>
          </div>
          <ul className="mt-2 space-y-1">
            {serviceAlerts.map((alert) => <li key={alert.id} className="text-sm">
              {alert.reservation.room ? `Room ${alert.reservation.room.number} · ` : ""}{alert.reservation.guest.firstName} {alert.reservation.guest.lastName} · {alert.serviceNumber} · {alert.overdueMinutes} min overdue{alert.specialInstructions ? ` · ${alert.specialInstructions}` : ""}
            </li>)}
          </ul>
        </section>
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
        {activeTab === "Reservations" && <ReservationsTab />}
        {activeTab === "Arrivals" && <ArrivalsTab />}
        {activeTab === "Departures" && <DeparturesTab />}
        {activeTab === "In-House" && <InHouseTab />}
        {activeTab === "Recheck-in" && <RecheckInTab />}
        {activeTab === "Register" && <GuestRegisterTab />}
        {activeTab === "New Reservation" && <ReservationCreateTab />}
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
