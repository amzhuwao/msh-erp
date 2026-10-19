"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
}

interface RoomType {
  id: string;
  name: string;
  code: string;
  maxChildren: number;
  ratePlans: { id: string; name: string; baseRate: string; isActive: boolean }[];
}

interface Availability {
  roomTypeId: string;
  availableCount: number;
  nightlyRate: string;
  contractedRate: string | null;
}

interface CorporateClient { id: string; companyName: string; isActive: boolean; isCreditApproved: boolean }

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ReservationCreateTab() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [companies, setCompanies] = useState<CorporateClient[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [guestId, setGuestId] = useState("");
  const [roomTypeId, setRoomTypeId] = useState("");
  const [checkInDate, setCheckInDate] = useState(localDate());
  const [checkOutDate, setCheckOutDate] = useState(localDate(1));
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<{ items: Guest[] }>("/api/guests?limit=100"),
      apiFetch<{ items: RoomType[] }>("/api/catalog/room-types"),
      apiFetch<{ items: CorporateClient[] }>("/api/corporate/profiles").catch(() => ({ items: [] })),
    ]).then(([guestData, roomData, companyData]) => {
      setGuests(guestData.items);
      setRoomTypes(roomData.items.filter((type) => type.ratePlans.some((plan) => plan.isActive)));
      setCompanies(companyData.items.filter((company) => company.isActive && company.isCreditApproved));
    }).catch((err) => setError(err instanceof Error ? err.message : "Could not load booking options"));
  }, []);

  const selectedType = roomTypes.find((type) => type.id === roomTypeId);
  const selectedRate = selectedType?.ratePlans.find((plan) => plan.isActive);
  const selectedAvailability = availability.find((item) => item.roomTypeId === roomTypeId);
  const datesValid = checkInDate < checkOutDate;

  async function searchAvailability() {
    setError("");
    setMessage("");
    setAvailability([]);
    if (!datesValid) {
      setError("Check-out must be after check-in.");
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetch<{ results: Availability[] }>(
        `/api/reservations/availability?checkIn=${checkInDate}&checkOut=${checkOutDate}&adults=${adults}${companyId ? `&companyId=${encodeURIComponent(companyId)}` : ""}`,
      );
      setAvailability(result.results);
      if (result.results.length === 0) setMessage("No rooms are available for those dates and guest count.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Availability search failed");
    } finally {
      setLoading(false);
    }
  }

  async function createReservation(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!guestId || !selectedRate || !selectedAvailability?.availableCount) {
      setError("Choose a guest and an available room type first.");
      return;
    }
    setLoading(true);
    try {
      const reservation = await apiFetch<{ reservationNumber: string }>("/api/reservations", {
        method: "POST",
        body: JSON.stringify({
          guestId,
          ratePlanId: selectedRate.id,
          checkInDate,
          checkOutDate,
          adults,
          children,
          companyId: companyId || undefined,
          source: "WALK_IN",
        }),
      });
      setMessage(`Reservation ${reservation.reservationNumber} created. Check the guest in from the Arrivals tab on or after ${checkInDate}.`);
      setAvailability([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reservation could not be created");
    } finally {
      setLoading(false);
    }
  }

  const rateLabel = useMemo(() => {
    const rate = selectedAvailability?.contractedRate ?? selectedAvailability?.nightlyRate ?? selectedRate?.baseRate;
    if (rate == null) return "Choose a room type";
    return `$${Number(rate).toFixed(2)} / night${selectedAvailability?.contractedRate ? " · contract rate" : ""}`;
  }, [selectedAvailability, selectedRate]);

  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-semibold text-[hsl(var(--primary))] mb-2">New reservation</h2>
      <p className="text-sm text-[hsl(var(--muted-foreground))] mb-5">Register the guest first from the Register tab if they are not listed.</p>

      {error && <div role="alert" className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div role="status" className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</div>}

      <form onSubmit={createReservation} className="space-y-5">
        <label className="block text-sm font-medium">
          Guest
          <select required className="msh-input mt-1" value={guestId} onChange={(event) => setGuestId(event.target.value)}>
            <option value="">Select registered guest</option>
            {guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.firstName} {guest.lastName}{guest.email ? ` · ${guest.email}` : ""}</option>)}
          </select>
        </label>

        <label className="block text-sm font-medium">Corporate account (optional)
          <select className="msh-input mt-1" value={companyId} onChange={(event) => { setCompanyId(event.target.value); setAvailability([]); setRoomTypeId(""); }}>
            <option value="">Standard rate</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.companyName}</option>)}
          </select>
        </label>

        <div className="grid md:grid-cols-2 gap-3">
          <label className="block text-sm font-medium">Check-in<input required type="date" className="msh-input mt-1" value={checkInDate} onChange={(event) => { setCheckInDate(event.target.value); setAvailability([]); }} /></label>
          <label className="block text-sm font-medium">Check-out<input required type="date" className="msh-input mt-1" value={checkOutDate} onChange={(event) => { setCheckOutDate(event.target.value); setAvailability([]); }} /></label>
          <label className="block text-sm font-medium">Adults<input required type="number" min={1} className="msh-input mt-1" value={adults} onChange={(event) => { setAdults(Number(event.target.value)); setAvailability([]); }} /></label>
          <label className="block text-sm font-medium">Children<input type="number" min={0} className="msh-input mt-1" value={children} onChange={(event) => { setChildren(Number(event.target.value)); setAvailability([]); }} /></label>
        </div>

        <button type="button" onClick={searchAvailability} disabled={loading} className="msh-btn msh-btn-primary">
          {loading ? "Please wait…" : "Check availability"}
        </button>

        {availability.length > 0 && <div className="space-y-3">
          <label className="block text-sm font-medium">Room type
            <select required className="msh-input mt-1" value={roomTypeId} onChange={(event) => setRoomTypeId(event.target.value)}>
              <option value="">Select an available room type</option>
              {availability.filter((item) => {
                const type = roomTypes.find((candidate) => candidate.id === item.roomTypeId);
                return type && children <= type.maxChildren;
              }).map((item) => {
                const type = roomTypes.find((candidate) => candidate.id === item.roomTypeId);
                return type ? <option key={type.id} value={type.id}>{type.name} ({item.availableCount} available)</option> : null;
              })}
            </select>
          </label>
          {selectedType && <p className="text-sm text-slate-600">{selectedType.code} · {rateLabel} · {selectedAvailability?.availableCount ?? 0} available</p>}
          <button type="submit" disabled={loading || !selectedAvailability?.availableCount} className="msh-btn msh-btn-primary">
            {loading ? "Creating reservation…" : "Create reservation"}
          </button>
        </div>}
      </form>
    </div>
  );
}
