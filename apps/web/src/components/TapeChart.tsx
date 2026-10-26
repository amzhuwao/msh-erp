"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Room {
  id: string;
  number: string;
  floor: number;
  status: string;
  roomType: { id: string; code: string; name: string };
}

interface Reservation {
  id: string;
  reservationNumber: string;
  roomId: string | null;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  adults: number;
  children: number;
  guest: { firstName: string; lastName: string; email?: string | null; phone?: string | null; companyName?: string | null };
  room?: { number: string } | null;
  ratePlan?: { code?: string; name: string; roomType?: { name: string } };
  corporateCompany?: { companyName: string } | null;
  groupReservation?: { groupName: string; company?: { companyName: string } | null } | null;
}

interface GuestOption { id: string; firstName: string; lastName: string; email: string | null }
interface GuestRegistration {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nationality: string;
  nationalId: string;
  passportNumber: string;
}
interface RoomTypeOption { id: string; ratePlans: { id: string; name: string; isActive: boolean; baseRate: string }[] }
interface CreateTarget { room: Room; date: string }

const statusColors: Record<string, string> = {
  TENTATIVE: "bg-slate-400",
  CONFIRMED: "bg-blue-500",
  CHECKED_IN: "bg-emerald-600",
  CHECKED_OUT: "bg-slate-500",
};

const visibleWeekTabs = 5;

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfWeek(date = new Date()) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return dateKey(monday);
}

function addDays(date: string, count: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + count);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function formatDate(date: string) {
  return new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function printDate(date: string) {
  return new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function formatWeekRange(weekStart: string) {
  const weekEnd = addDays(weekStart, 6);
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(`${weekEnd}T12:00:00`);
  const startMonth = start.toLocaleDateString(undefined, { month: "short" });
  const endMonth = end.toLocaleDateString(undefined, { month: "short" });
  const year = end.getFullYear();
  return startMonth === endMonth
    ? `${startMonth} ${start.getDate()}–${end.getDate()}, ${year}`
    : `${startMonth} ${start.getDate()}–${endMonth} ${end.getDate()}, ${year}`;
}

function mealPlan(reservation: Reservation) {
  const plan = `${reservation.ratePlan?.code ?? ""} ${reservation.ratePlan?.name ?? ""}`.toLowerCase();
  return /breakfast|\bbb\b|b\s*&\s*b/.test(plan) ? "Bed & Breakfast" : "Bed only";
}

export function TapeChart() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek());
  const [weekTabStart, setWeekTabStart] = useState(() => addDays(startOfWeek(), -14));
  const [dates, setDates] = useState<string[]>([]);
  const [ledgerDate, setLedgerDate] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);
  const [guests, setGuests] = useState<GuestOption[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomTypeOption[]>([]);
  const [guestId, setGuestId] = useState("");
  const [guestSearch, setGuestSearch] = useState("");
  const [registeringGuest, setRegisteringGuest] = useState(false);
  const [savingGuest, setSavingGuest] = useState(false);
  const [guestForm, setGuestForm] = useState<GuestRegistration>({ firstName: "", lastName: "", email: "", phone: "", nationality: "Zimbabwe", nationalId: "", passportNumber: "" });
  const [checkInImmediately, setCheckInImmediately] = useState(false);
  const [checkInPaymentAmount, setCheckInPaymentAmount] = useState("");
  const [checkInPaymentMethod, setCheckInPaymentMethod] = useState("CASH");
  const [creating, setCreating] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [draggedReservationId, setDraggedReservationId] = useState("");
  const [movingReservationId, setMovingReservationId] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await apiFetch<{ dates: string[]; rooms: Room[]; reservations: Reservation[] }>(
        `/api/front-office/tape-chart?from=${weekStart}&days=7`,
      );
      setDates(data.dates);
      setRooms(data.rooms);
      setReservations(data.reservations);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the tape chart");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [weekStart]);

  useEffect(() => { void load(); }, [load]);

  function getReservationForCell(roomId: string, date: string) {
    return reservations.find((reservation) =>
      reservation.roomId === roomId
      && date >= reservation.checkInDate.slice(0, 10)
      && date < reservation.checkOutDate.slice(0, 10),
    );
  }

  async function openCreate(room: Room, date: string) {
    setMessage("");
    setError("");
    setGuestId("");
    setGuestSearch("");
    setRegisteringGuest(false);
    setCheckInImmediately(false);
    setCheckInPaymentAmount("");
    setCheckInPaymentMethod("CASH");
    setCreateTarget({ room, date });
    setOptionsLoading(true);
    try {
      const [guestData, typeData] = await Promise.all([
        apiFetch<{ items: GuestOption[] }>("/api/guests?limit=20"),
        apiFetch<{ items: RoomTypeOption[] }>("/api/catalog/room-types"),
      ]);
      setGuests(guestData.items);
      setRoomTypes(typeData.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load reservation options");
    } finally {
      setOptionsLoading(false);
    }
  }

  useEffect(() => {
    if (!createTarget || registeringGuest) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({ search: guestSearch.trim(), limit: "20" });
        const result = await apiFetch<{ items: GuestOption[] }>(`/api/guests?${query.toString()}`);
        if (!cancelled) setGuests(result.items);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not search registered guests");
      }
    }, guestSearch ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [createTarget, guestSearch, registeringGuest]);

  async function registerGuest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!guestForm.nationalId.trim() && !guestForm.passportNumber.trim()) {
      setError("Enter a national ID or passport number to register the guest.");
      return;
    }
    setSavingGuest(true);
    setError("");
    try {
      const guest = await apiFetch<GuestOption>("/api/guests", {
        method: "POST",
        body: JSON.stringify({
          ...guestForm,
          email: guestForm.email.trim() || null,
          phone: guestForm.phone.trim() || null,
          nationalId: guestForm.nationalId.trim() || null,
          passportNumber: guestForm.passportNumber.trim() || null,
        }),
      });
      setGuests((current) => [guest, ...current.filter((item) => item.id !== guest.id)]);
      setGuestId(guest.id);
      setGuestSearch("");
      setRegisteringGuest(false);
      setGuestForm({ firstName: "", lastName: "", email: "", phone: "", nationality: "Zimbabwe", nationalId: "", passportNumber: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register guest");
    } finally {
      setSavingGuest(false);
    }
  }

  async function createReservation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createTarget || !guestId) return;
    const formData = new FormData(event.currentTarget);
    const checkOutDate = String(formData.get("checkOutDate") ?? "");
    if (checkOutDate <= createTarget.date) {
      setError("Check-out must be after check-in.");
      return;
    }
    const ratePlan = roomTypes.find((type) => type.id === createTarget.room.roomType.id)?.ratePlans.find((plan) => plan.isActive);
    if (!ratePlan) {
      setError("This room type has no active rate plan, so a reservation cannot be created here.");
      return;
    }
    if (checkInImmediately && Number(checkInPaymentAmount) <= 0) {
      setError("Enter a payment amount to check in immediately.");
      return;
    }
    setCreating(true);
    setError("");
    let createdReservation: Reservation | null = null;
    try {
      const result = await apiFetch<Reservation>("/api/reservations", {
        method: "POST",
        body: JSON.stringify({
          guestId,
          ratePlanId: ratePlan.id,
          roomId: createTarget.room.id,
          checkInDate: createTarget.date,
          checkOutDate,
          adults: 1,
          children: 0,
          source: "WALK_IN",
        }),
      });
      createdReservation = result;
      if (checkInImmediately) {
        const detail = await apiFetch<{ folios: { id: string }[] }>(`/api/reservations/${result.id}`);
        const folio = detail.folios[0];
        if (!folio) throw new Error("Reservation created, but no guest folio was found for payment.");
        await apiFetch(`/api/folios/${folio.id}/payments`, {
          method: "POST",
          body: JSON.stringify({
            description: `Reservation payment ${result.reservationNumber}`,
            amount: Number(checkInPaymentAmount),
            paymentMethod: checkInPaymentMethod,
          }),
        });
        await apiFetch(`/api/reservations/${result.id}/checkin`, {
          method: "POST",
          body: JSON.stringify({ roomId: createTarget.room.id }),
        });
      }
      setCreateTarget(null);
      setMessage(checkInImmediately
        ? `Reservation ${result.reservationNumber} created and guest checked in to room ${createTarget.room.number}.`
        : `Reservation ${result.reservationNumber} created for room ${createTarget.room.number}.`);
      await load(true);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Could not complete the request";
      if (createdReservation) {
        setCreateTarget(null);
        setError(`Reservation ${createdReservation.reservationNumber} was created, but immediate check-in did not complete: ${reason}`);
        await load(true);
      } else {
        setError(reason);
      }
    } finally {
      setCreating(false);
    }
  }

  async function moveReservation(reservationId: string, room: Room, date: string) {
    if (movingReservationId) return;
    setMovingReservationId(reservationId);
    setError("");
    setMessage("");
    try {
      const updated = await apiFetch<Reservation>(`/api/reservations/${reservationId}/tape-chart-move`, {
        method: "PATCH",
        body: JSON.stringify({ roomId: room.id, checkInDate: date }),
      });
      setMessage(`Reservation ${updated.reservationNumber} moved to room ${room.number}, ${formatDate(date)}.`);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move reservation");
    } finally {
      setMovingReservationId("");
      setDraggedReservationId("");
    }
  }

  function printGuestLedger() {
    const date = (dates.includes(ledgerDate) ? ledgerDate : dates[0]) || "";
    if (!date) return;
    const ledgerRows = reservations
      .filter((reservation) =>
        ["CONFIRMED", "CHECKED_IN"].includes(reservation.status)
        && reservation.checkInDate.slice(0, 10) <= date
        && reservation.checkOutDate.slice(0, 10) >= date,
      )
      .sort((a, b) => (a.room?.number ?? "").localeCompare(b.room?.number ?? "", undefined, { numeric: true }));

    const popup = window.open("", "_blank", "width=1100,height=760");
    if (!popup) {
      setError("Allow pop-ups to print the guest ledger.");
      return;
    }
    const rows = ledgerRows.map((reservation) => {
      const guestName = `${reservation.guest.firstName} ${reservation.guest.lastName}`;
      const organisation = reservation.corporateCompany?.companyName
        || reservation.groupReservation?.company?.companyName
        || reservation.groupReservation?.groupName
        || reservation.guest.companyName
        || "—";
      return `<tr>
        <td>${escapeHtml(printDate(reservation.checkInDate))}</td>
        <td>${escapeHtml(printDate(reservation.checkOutDate))}</td>
        <td>${escapeHtml(guestName)}</td>
        <td>${escapeHtml(reservation.room?.number ?? "Unassigned")}</td>
        <td>${escapeHtml(mealPlan(reservation))}</td>
        <td>${escapeHtml(organisation)}</td>
      </tr>`;
    }).join("");

    popup.document.write(`<!doctype html><html><head><title>Guest ledger · ${escapeHtml(printDate(date))}</title>
      <style>
        * { box-sizing: border-box; }
        body { margin: 28px; color: #172033; font: 13px Arial, sans-serif; }
        h1 { margin: 0 0 5px; font-size: 22px; }
        .sub { margin: 0 0 18px; color: #566174; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 9px 8px; border: 1px solid #cbd2dc; text-align: left; }
        th { background: #eef2f6; font-weight: 700; }
        .count { margin-top: 12px; color: #566174; font-size: 12px; }
        @media print { body { margin: 12mm; } }
      </style></head><body>
      <h1>Daily Guest Ledger</h1>
      <p class="sub">Stay date: ${escapeHtml(printDate(date))}</p>
      <table><thead><tr><th>Check-in</th><th>Check-out</th><th>Guest name</th><th>Room</th><th>Plan</th><th>Organisation</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">No confirmed or checked-in guests for this date.</td></tr>'}</tbody></table>
      <p class="count">${ledgerRows.length} guest${ledgerRows.length === 1 ? "" : "s"}</p>
      <script>window.onload = () => { window.focus(); window.print(); };</script>
      </body></html>`);
    popup.document.close();
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Loading tape chart…</div>;

  const targetRate = createTarget && roomTypes.find((type) => type.id === createTarget.room.roomType.id)
    ?.ratePlans.find((plan) => plan.isActive);
  const canCheckInImmediately = Boolean(createTarget
    && createTarget.date === new Date().toISOString().slice(0, 10)
    && createTarget.room.status === "INSPECTED");
  const weekTabs = Array.from({ length: visibleWeekTabs }, (_, index) => addDays(weekTabStart, index * 7));
  const activeLedgerDate = dates.includes(ledgerDate) ? ledgerDate : dates[0] || "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Room tape chart</h2>
          <p className="text-xs text-slate-500">Select an occupied cell to view a reservation. Select an empty cell to create one. Drag a reservation to an empty room/date cell to move it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded bg-slate-400" /> Tentative</span>
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded bg-blue-500" /> Confirmed</span>
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded bg-emerald-600" /> Checked in</span>
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded bg-slate-500" /> Checked out</span>
          <label className="flex items-center gap-1" htmlFor="guest-ledger-date">Ledger date
            <select id="guest-ledger-date" className="rounded border bg-white px-2 py-1" value={activeLedgerDate} onChange={(event) => setLedgerDate(event.target.value)}>
              {dates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}
            </select>
          </label>
          <button type="button" className="msh-btn msh-btn-outline text-xs" disabled={!dates.length} onClick={printGuestLedger}>Print guest ledger</button>
          <button type="button" className="msh-btn msh-btn-outline text-xs" disabled={refreshing} onClick={() => void load(true)}>{refreshing ? "Refreshing…" : "Refresh"}</button>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border bg-slate-50 p-2">
        <button
          type="button"
          className="msh-btn msh-btn-outline shrink-0 text-xs"
          aria-label="Show earlier weeks"
          title="Show earlier weeks"
          onClick={() => {
            const earlierStart = addDays(weekTabStart, -visibleWeekTabs * 7);
            setWeekTabStart(earlierStart);
            setWeekStart(addDays(earlierStart, (visibleWeekTabs - 1) * 7));
            setLedgerDate("");
          }}
        >←</button>
        <div role="tablist" aria-label="Tape chart weeks" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {weekTabs.map((tabWeekStart) => {
            const selected = tabWeekStart === weekStart;
            return <button
              key={tabWeekStart}
              id={`tape-week-${tabWeekStart}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="tape-chart-panel"
              className={`shrink-0 rounded-md px-3 py-2 text-xs font-medium ${selected ? "bg-sky-700 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}
              onClick={() => {
                setLedgerDate("");
                setWeekStart(tabWeekStart);
              }}
            >{formatWeekRange(tabWeekStart)}</button>;
          })}
        </div>
        <button
          type="button"
          className="msh-btn msh-btn-outline shrink-0 text-xs"
          aria-label="Show later weeks"
          title="Show later weeks"
          onClick={() => {
            const laterStart = addDays(weekTabStart, visibleWeekTabs * 7);
            setWeekTabStart(laterStart);
            setWeekStart(laterStart);
            setLedgerDate("");
          }}
        >→</button>
      </div>

      {(error || message) && <div role={error ? "alert" : "status"} className={`rounded border p-2 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error || message}</div>}

      <div id="tape-chart-panel" role="tabpanel" aria-labelledby={`tape-week-${weekStart}`} className="overflow-x-auto">
        <table className="w-full min-w-[1050px] border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-20 border bg-slate-50 p-2 text-left">Room</th>
              <th className="sticky left-20 z-20 w-32 border bg-slate-50 p-2 text-left">Room type</th>
              <th className="w-28 border bg-slate-50 p-2 text-left">Housekeeping</th>
              {dates.map((date) => <th key={date} className="min-w-[78px] border bg-slate-50 p-2 text-center">{formatDate(date)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => <tr key={room.id}>
              <th className="sticky left-0 z-10 border bg-white p-2 text-left font-semibold">{room.number}</th>
              <td className="sticky left-20 z-10 border bg-white p-2 text-slate-600">{room.roomType.code} · {room.roomType.name}</td>
              <td className="border p-2"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{room.status.replace(/_/g, " ")}</span></td>
              {dates.map((date) => {
                const reservation = getReservationForCell(room.id, date);
                const canDropHere = !reservation || reservation.id === draggedReservationId;
                const canMove = reservation && ["CONFIRMED", "TENTATIVE"].includes(reservation.status);
                const isStart = reservation?.checkInDate.slice(0, 10) === date;
                return <td
                  key={date}
                  className={`h-9 border p-0.5 ${!reservation ? "bg-white" : ""} ${draggedReservationId && canDropHere ? "bg-sky-50" : ""}`}
                  onDragOver={(event) => { if (draggedReservationId && canDropHere) event.preventDefault(); }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const reservationId = event.dataTransfer.getData("text/plain") || draggedReservationId;
                    if (reservationId && canDropHere) void moveReservation(reservationId, room, date);
                  }}
                >
                  {reservation ? <button
                    type="button"
                    draggable={Boolean(canMove)}
                    onDragStart={(event) => {
                      if (!canMove) { event.preventDefault(); return; }
                      setDraggedReservationId(reservation.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", reservation.id);
                    }}
                    onDragEnd={() => setDraggedReservationId("")}
                    onClick={() => { setError(""); setSelectedReservation(reservation); }}
                    className={`flex h-full w-full items-center overflow-hidden rounded px-1 text-left text-white ${statusColors[reservation.status] ?? "bg-slate-500"} ${canMove ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${movingReservationId === reservation.id ? "opacity-60" : ""}`}
                    title={`${reservation.guest.firstName} ${reservation.guest.lastName} · ${reservation.reservationNumber} · ${reservation.status}${canMove ? " · Drag to move" : ""}`}
                    aria-label={`${reservation.guest.firstName} ${reservation.guest.lastName}, ${reservation.reservationNumber}, ${reservation.status}. Click to view${canMove ? " or drag to move" : ""}.`}
                  >
                    {isStart ? <span className="truncate font-semibold">{reservation.guest.lastName} · {reservation.reservationNumber}</span> : <span className="sr-only">{reservation.guest.lastName} reservation continues</span>}
                  </button> : <button
                    type="button"
                    className="group flex h-full w-full items-center justify-center rounded text-slate-300 hover:bg-sky-50 hover:text-sky-700"
                    onClick={() => void openCreate(room, date)}
                    aria-label={`Create reservation for room ${room.number} on ${formatDate(date)}`}
                    title={`Create reservation · ${room.number} · ${formatDate(date)}`}
                  ><span className="opacity-0 group-hover:opacity-100">+</span></button>}
                </td>;
              })}
            </tr>)}
            {!rooms.length && <tr><td colSpan={3 + dates.length} className="border p-6 text-center text-slate-500">No active rooms found.</td></tr>}
          </tbody>
        </table>
      </div>

      {selectedReservation && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedReservation(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="tape-reservation-title" className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3"><div><h2 id="tape-reservation-title" className="text-lg font-semibold">{selectedReservation.guest.firstName} {selectedReservation.guest.lastName}</h2><p className="text-sm text-slate-500">{selectedReservation.reservationNumber}</p></div><button type="button" className="msh-btn msh-btn-outline text-sm" onClick={() => setSelectedReservation(null)}>Close</button></div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Info label="Status" value={selectedReservation.status.replace(/_/g, " ")} />
            <Info label="Room" value={selectedReservation.room?.number ?? rooms.find((room) => room.id === selectedReservation.roomId)?.number ?? "Unassigned"} />
            <Info label="Check-in" value={formatDate(selectedReservation.checkInDate)} />
            <Info label="Check-out" value={formatDate(selectedReservation.checkOutDate)} />
            <Info label="Guests" value={`${selectedReservation.adults} adult(s), ${selectedReservation.children} child(ren)`} />
            <Info label="Rate plan" value={selectedReservation.ratePlan?.name ?? "—"} />
            <Info label="Email" value={selectedReservation.guest.email || "—"} />
            <Info label="Phone" value={selectedReservation.guest.phone || "—"} />
          </dl>
          {!["CONFIRMED", "TENTATIVE"].includes(selectedReservation.status) && <p className="mt-4 rounded bg-amber-50 p-2 text-xs text-amber-800">Checked-in or completed reservations can’t be moved from the tape chart.</p>}
        </section>
      </div>}

      {createTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !creating) setCreateTarget(null); }}>
        <form role="dialog" aria-modal="true" aria-labelledby="tape-create-title" onSubmit={(event) => void (registeringGuest ? registerGuest(event) : createReservation(event))} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3"><div><h2 id="tape-create-title" className="text-lg font-semibold">New reservation</h2><p className="text-sm text-slate-500">Room {createTarget.room.number} · {createTarget.room.roomType.name} · {formatDate(createTarget.date)}</p></div><button type="button" className="msh-btn msh-btn-outline text-sm" disabled={creating} onClick={() => setCreateTarget(null)}>Close</button></div>
          {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
          {optionsLoading ? <p className="text-sm text-slate-500">Loading guests and rate plans…</p> : registeringGuest ? <div className="space-y-3 rounded-lg border bg-slate-50 p-3">
            <div className="flex items-center justify-between"><h3 className="font-medium">Register a new guest</h3><button type="button" className="text-sm text-sky-700 underline" onClick={() => { setRegisteringGuest(false); setError(""); }}>Back to guest search</button></div>
            <label className="block text-sm">First name *<input required className="msh-input mt-1" value={guestForm.firstName} onChange={(event) => setGuestForm({ ...guestForm, firstName: event.target.value })} /></label>
            <label className="block text-sm">Last name *<input required className="msh-input mt-1" value={guestForm.lastName} onChange={(event) => setGuestForm({ ...guestForm, lastName: event.target.value })} /></label>
            <label className="block text-sm">Nationality *<input required minLength={2} className="msh-input mt-1" value={guestForm.nationality} onChange={(event) => setGuestForm({ ...guestForm, nationality: event.target.value })} /></label>
            <label className="block text-sm">National ID<input className="msh-input mt-1" value={guestForm.nationalId} onChange={(event) => setGuestForm({ ...guestForm, nationalId: event.target.value })} /></label>
            <label className="block text-sm">Passport number<input className="msh-input mt-1" value={guestForm.passportNumber} onChange={(event) => setGuestForm({ ...guestForm, passportNumber: event.target.value })} /></label>
            <label className="block text-sm">Email<input type="email" className="msh-input mt-1" value={guestForm.email} onChange={(event) => setGuestForm({ ...guestForm, email: event.target.value })} /></label>
            <label className="block text-sm">Phone<input type="tel" className="msh-input mt-1" value={guestForm.phone} onChange={(event) => setGuestForm({ ...guestForm, phone: event.target.value })} /></label>
            <p className="text-xs text-slate-500">Nationality and a national ID or passport number are required.</p>
            <button type="submit" className="msh-btn msh-btn-primary" disabled={savingGuest || !guestForm.firstName.trim() || !guestForm.lastName.trim() || guestForm.nationality.trim().length < 2 || (!guestForm.nationalId.trim() && !guestForm.passportNumber.trim())}>{savingGuest ? "Registering…" : "Register and select guest"}</button>
          </div> : <>
            <label className="block text-sm">Search registered guests<input className="msh-input mt-1" type="search" placeholder="Name, email, or phone" value={guestSearch} onChange={(event) => { setGuestSearch(event.target.value); setGuestId(""); }} /></label>
            <label className="block text-sm">Guest<select required className="msh-input mt-1" value={guestId} onChange={(event) => setGuestId(event.target.value)}><option value="">Choose a registered guest</option>{guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.firstName} {guest.lastName}{guest.email ? ` · ${guest.email}` : ""}</option>)}</select></label>
            {!guests.length && <p className="text-sm text-amber-700">No matching registered guests.</p>}
            <button type="button" className="msh-btn msh-btn-outline text-sm" onClick={() => { setGuestForm({ firstName: "", lastName: "", email: "", phone: "", nationality: "Zimbabwe", nationalId: "", passportNumber: "" }); setError(""); setRegisteringGuest(true); }}>+ Register new guest</button>
            <label className="block text-sm">Check-out date<input required className="msh-input mt-1" type="date" min={addDays(createTarget.date, 1)} defaultValue={addDays(createTarget.date, 1)} key={createTarget.date} name="checkOutDate" /></label>
            <p className="text-xs text-slate-500">The selected room and check-in date are set from the chart. The room type’s first active rate plan is used{targetRate ? ` (${targetRate.name}, $${Number(targetRate.baseRate).toFixed(2)} per night)` : "."}</p>
            <label className={`flex items-start gap-2 rounded border p-3 text-sm ${canCheckInImmediately ? "" : "bg-slate-50 text-slate-500"}`}>
              <input type="checkbox" className="mt-1" checked={checkInImmediately} disabled={!canCheckInImmediately} onChange={(event) => setCheckInImmediately(event.target.checked)} />
              <span><span className="font-medium">Check in immediately</span><span className="mt-1 block text-xs">Available for today’s check-in when the room is inspected. A payment is required to confirm and check in the reservation.</span></span>
            </label>
            {checkInImmediately && <div className="grid grid-cols-2 gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <label className="block text-sm">Payment amount *<input required type="number" min="0.01" step="0.01" className="msh-input mt-1" value={checkInPaymentAmount} onChange={(event) => setCheckInPaymentAmount(event.target.value)} /></label>
              <label className="block text-sm">Payment method<select className="msh-input mt-1" value={checkInPaymentMethod} onChange={(event) => setCheckInPaymentMethod(event.target.value)}>{["CASH", "CARD", "MOBILE", "BANK_TRANSFER", "ECOCASH", "ONEMONEY", "ROOM_CHARGE"].map((method) => <option key={method} value={method}>{method.replace(/_/g, " ")}</option>)}</select></label>
            </div>}
          </>}
          {!registeringGuest && <div className="flex justify-end gap-2"><button type="button" className="msh-btn msh-btn-outline" disabled={creating} onClick={() => setCreateTarget(null)}>Cancel</button><button type="submit" className="msh-btn msh-btn-primary" disabled={creating || optionsLoading || !guestId || !targetRate || (checkInImmediately && Number(checkInPaymentAmount) <= 0)}>{creating ? checkInImmediately ? "Creating and checking in…" : "Creating…" : checkInImmediately ? "Create and check in" : "Create reservation"}</button></div>}
        </form>
      </div>}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>;
}
