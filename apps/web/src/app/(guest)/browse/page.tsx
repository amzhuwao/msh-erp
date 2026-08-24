"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { IconBed, IconCar, IconCoffee, IconPeople, IconSearch, IconWifi } from "@/components/portal/Icons";
import { publicApiFetch } from "@/lib/api";
import { addDaysISO, formatMoney, nightsBetween, roomImage, todayISO } from "@/lib/portal";

interface CatalogRoom {
  roomTypeId: string;
  code: string;
  name: string;
  description: string;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  nightlyRate: string;
  ratePlanId: string | null;
}

interface AvailableRoom {
  roomTypeId: string;
  code: string;
  name: string;
  maxAdults: number;
  maxChildren: number;
  availableCount: number;
  ratePlanId: string;
  nightlyRate: string;
}

export default function BrowsePage() {
  const router = useRouter();
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(addDaysISO(todayISO(), 1));
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");
  const [roomType, setRoomType] = useState("all");
  const [catalog, setCatalog] = useState<CatalogRoom[]>([]);
  const [available, setAvailable] = useState<AvailableRoom[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    publicApiFetch<{ rooms: CatalogRoom[] }>("/api/public/rooms")
      .then((d) => setCatalog(d.rooms))
      .catch(() => undefined);
  }, []);

  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);

  async function search() {
    setError("");
    setSearching(true);
    try {
      const data = await publicApiFetch<{ results: AvailableRoom[] }>(
        `/api/public/availability?checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}`,
      );
      setAvailable(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setAvailable([]);
    } finally {
      setSearching(false);
    }
  }

  const catalogByType = Object.fromEntries(catalog.map((r) => [r.roomTypeId, r]));
  const shown = available
    ? available.filter((r) => roomType === "all" || r.roomTypeId === roomType)
    : catalog.filter((r) => roomType === "all" || r.roomTypeId === roomType);

  function book(room: { ratePlanId: string | null; name: string }) {
    if (!room.ratePlanId) return;
    const qs = new URLSearchParams({
      ratePlanId: room.ratePlanId,
      checkIn,
      checkOut,
      adults,
      children,
      name: room.name,
    });
    router.push(`/book?${qs.toString()}`);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="page-header text-center max-w-2xl mx-auto">
        <h1 className="page-title text-4xl">Our Rooms & Suites</h1>
        <p className="page-description text-lg mt-2">Find and book the perfect room at Manica Skyview Hotel.</p>
      </div>
      <div className="flex justify-center gap-8 mb-8 text-sm text-muted-foreground">
        {[{ icon: IconWifi, label: "Free WiFi" }, { icon: IconCar, label: "Parking" }, { icon: IconCoffee, label: "Breakfast" }].map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <item.icon className="h-4 w-4 text-accent" />
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-card shadow-sm mb-8 max-w-5xl mx-auto">
        <div className="p-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium mb-1.5">Check-in</label>
              <input type="date" className="msh-input" value={checkIn} min={todayISO()} onChange={(e) => setCheckIn(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Check-out</label>
              <input type="date" className="msh-input" value={checkOut} min={checkIn || todayISO()} onChange={(e) => setCheckOut(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 flex items-center gap-1"><IconPeople /> Adults</label>
              <input type="number" min={1} max={10} className="msh-input" value={adults} onChange={(e) => setAdults(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 flex items-center gap-1"><IconPeople /> Children</label>
              <input type="number" min={0} max={10} className="msh-input" value={children} onChange={(e) => setChildren(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Room Type</label>
              <select className="msh-input" value={roomType} onChange={(e) => setRoomType(e.target.value)}>
                <option value="all">All Types</option>
                {catalog.map((r) => (
                  <option key={r.roomTypeId} value={r.roomTypeId}>{r.name}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={search} disabled={searching} className="msh-btn msh-btn-primary h-10">
              <IconSearch className="h-4 w-4 mr-2" />
              {searching ? "Searching..." : "Search"}
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-center text-sm text-destructive mb-4">{error}</p>}

      <div className="max-w-5xl mx-auto">
        {available && shown.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <IconBed className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">No rooms available for your dates</p>
            <p className="text-sm">Try different dates or filters.</p>
          </div>
        ) : (
          <>
            {available && (
              <p className="text-sm text-muted-foreground mb-4">
                {shown.length} room type{shown.length !== 1 ? "s" : ""} available for {nights} night{nights !== 1 ? "s" : ""}
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {shown.map((room) => {
                const meta = "ratePlanId" in room && "availableCount" in room ? catalogByType[room.roomTypeId] : (room as CatalogRoom);
                const name = room.name;
                const rate = "nightlyRate" in room ? Number(room.nightlyRate) : 0;
                const occupancy = meta?.maxOccupancy ?? (("maxAdults" in room ? room.maxAdults : 2) + ("maxChildren" in room ? room.maxChildren : 0));
                const ratePlanId = "ratePlanId" in room ? room.ratePlanId : null;
                const description = meta && "description" in meta ? meta.description : "";
                return (
                  <div key={room.roomTypeId} className="rounded-lg border bg-card overflow-hidden hover:shadow-lg transition-shadow">
                    <div className="h-44 overflow-hidden">
                      <img src={roomImage(name)} alt={name} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-5">
                      <h3 className="text-lg font-display font-semibold mb-1">{name}</h3>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                        <span className="flex items-center gap-1"><IconPeople /> Up to {occupancy} guests</span>
                      </div>
                      {description && <p className="text-sm text-muted-foreground mb-4 leading-relaxed line-clamp-2">{description}</p>}
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold font-display">{formatMoney(rate)}</span>
                        <span className="text-sm text-muted-foreground">/ night</span>
                      </div>
                      {available && nights > 0 && (
                        <p className="text-sm text-muted-foreground mt-1">{formatMoney(rate * nights)} total · {nights} night{nights !== 1 ? "s" : ""}</p>
                      )}
                      <button
                        type="button"
                        className="msh-btn msh-btn-primary w-full mt-4"
                        disabled={!ratePlanId}
                        onClick={() => book({ ratePlanId, name })}
                      >
                        Book Now
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {!available && shown.length === 0 && (
          <p className="text-center text-muted-foreground py-12">Loading rooms…</p>
        )}
      </div>
    </div>
  );
}
