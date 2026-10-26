"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type ReservationStatus = "TENTATIVE" | "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED" | "NO_SHOW";
interface Reservation {
  id: string;
  reservationNumber: string;
  guestId: string;
  roomId: string | null;
  checkInDate: string;
  checkOutDate: string;
  status: ReservationStatus;
  adults: number;
  children: number;
  source: string;
  contractedRate: string | number | null;
  guest: { firstName: string; lastName: string; email: string | null; phone: string | null };
  room: { id: string; number: string; roomType: { code: string; name: string } } | null;
  ratePlan: { id: string; name: string; baseRate: string | number; roomTypeId: string; roomType: { code: string; name: string } };
  folios: { id: string; lines: { lineType: string; amount: string | number }[] }[];
}

interface GuestOption { id: string; firstName: string; lastName: string; email: string | null }
interface RoomOption { id: string; number: string; status: string; roomTypeId: string }

interface ReservationPage {
  items: Reservation[];
  total: number;
  page: number;
  limit: number;
}

const statuses: ReservationStatus[] = ["TENTATIVE", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED", "NO_SHOW"];
const statusStyle: Record<ReservationStatus, string> = {
  TENTATIVE: "bg-slate-100 text-slate-700",
  CONFIRMED: "bg-blue-100 text-blue-800",
  CHECKED_IN: "bg-emerald-100 text-emerald-800",
  CHECKED_OUT: "bg-slate-100 text-slate-600",
  CANCELLED: "bg-red-100 text-red-800",
  NO_SHOW: "bg-orange-100 text-orange-800",
};

function dateLabel(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

function openReservationProforma(reservationId: string) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  window.open(`${base}/dashboard/documents/${reservationId}?type=proforma&source=reservation`, "_blank");
}

export function ReservationsTab() {
  const [result, setResult] = useState<ReservationPage | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editGuests, setEditGuests] = useState<GuestOption[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [editForm, setEditForm] = useState({ guestId: "", roomId: "", checkInDate: "", checkOutDate: "", adults: 1, children: 0, specialRequests: "" });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [savingCancel, setSavingCancel] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInRoomId, setCheckInRoomId] = useState("");
  const [checkInRooms, setCheckInRooms] = useState<RoomOption[]>([]);
  const [savingCheckIn, setSavingCheckIn] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ description: "", amount: "", paymentMethod: "CASH" });

  const load = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), limit: "20" });
    if (status) query.set("status", status);
    if (search) query.set("search", search);
    try {
      setResult(await apiFetch<ReservationPage>(`/api/reservations?${query.toString()}`));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load reservations");
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => { void load(); }, [load]);

  const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / 20));

  function paymentSummary(reservation: Reservation) {
    const paid = reservation.folios.reduce((total, folio) => total + folio.lines
      .filter((line) => line.lineType === "PAYMENT")
      .reduce((sum, line) => sum + Number(line.amount), 0), 0);
    const nights = Math.max(1, Math.round((new Date(reservation.checkOutDate).getTime() - new Date(reservation.checkInDate).getTime()) / 86_400_000));
    const expected = Number(reservation.contractedRate ?? reservation.ratePlan.baseRate) * nights;
    const state = paid <= 0 ? "UNPAID" : paid + 0.01 >= expected ? "PAID" : "PARTIALLY PAID";
    return { paid, expected, state };
  }

  async function beginEdit() {
    if (!selected) return;
    setError(""); setEditOpen(true); setEditLoading(true);
    setEditForm({
      guestId: selected.guestId,
      roomId: selected.roomId ?? "",
      checkInDate: selected.checkInDate.slice(0, 10),
      checkOutDate: selected.checkOutDate.slice(0, 10),
      adults: selected.adults,
      children: selected.children,
      specialRequests: "",
    });
    try {
      const [guestData, roomData, detail] = await Promise.all([
        apiFetch<{ items: GuestOption[] }>("/api/guests?limit=100"),
        apiFetch<{ items: RoomOption[] }>("/api/rooms"),
        apiFetch<Reservation & { specialRequests?: string | null }>(`/api/reservations/${selected.id}`),
      ]);
      setEditGuests(guestData.items); setRooms(roomData.items);
      setEditForm({
        guestId: selected.guestId,
        roomId: selected.roomId ?? "",
        checkInDate: selected.checkInDate.slice(0, 10),
        checkOutDate: selected.checkOutDate.slice(0, 10),
        adults: selected.adults,
        children: selected.children,
        specialRequests: detail.specialRequests ?? "",
      });
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load edit options"); }
    finally { setEditLoading(false); }
  }

  async function saveReservationEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSavingEdit(true); setError("");
    try {
      const updated = await apiFetch<Reservation>(`/api/reservations/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          guestId: editForm.guestId,
          roomId: editForm.roomId || null,
          checkInDate: editForm.checkInDate,
          checkOutDate: editForm.checkOutDate,
          adults: editForm.adults,
          children: editForm.children,
          specialRequests: editForm.specialRequests,
        }),
      });
      setSelected(updated); setEditOpen(false); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update reservation"); }
    finally { setSavingEdit(false); }
  }

  async function cancelSelected(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSavingCancel(true); setError("");
    try {
      await apiFetch(`/api/reservations/${selected.id}/cancel`, { method: "POST", body: JSON.stringify({ reason: cancelReason }) });
      setSelected(null); setCancelOpen(false); setCancelReason(""); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not cancel reservation"); }
    finally { setSavingCancel(false); }
  }

  async function beginCheckIn() {
    if (!selected) return;
    setError("");
    try {
      const roomData = await apiFetch<{ items: RoomOption[] }>("/api/rooms");
      const eligible = roomData.items.filter((room) => room.status === "INSPECTED" && room.roomTypeId === selected.ratePlan.roomTypeId);
      setCheckInRooms(eligible);
      setCheckInRoomId(eligible.some((room) => room.id === selected.roomId) ? selected.roomId! : "");
      setCheckInOpen(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load inspected rooms"); }
  }

  async function checkInSelected(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !checkInRoomId) return;
    setSavingCheckIn(true); setError("");
    try {
      const updated = await apiFetch<Reservation>(`/api/reservations/${selected.id}/checkin`, {
        method: "POST", body: JSON.stringify({ roomId: checkInRoomId }),
      });
      setSelected(updated); setCheckInOpen(false); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not check in guest"); }
    finally { setSavingCheckIn(false); }
  }

  async function recordPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected?.folios[0]) return;
    setSavingPayment(true); setError("");
    try {
      await apiFetch(`/api/folios/${selected.folios[0].id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          description: paymentForm.description.trim(),
          amount: Number(paymentForm.amount),
          paymentMethod: paymentForm.paymentMethod,
        }),
      });
      const updated = await apiFetch<Reservation>(`/api/reservations/${selected.id}`);
      setSelected(updated); setPaymentOpen(false);
      setPaymentForm({ description: "", amount: "", paymentMethod: "CASH" });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not record payment"); }
    finally { setSavingPayment(false); }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="font-semibold">All reservations</h2><p className="text-sm text-slate-500">Search and review reservations across every status.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchValue.trim()); }}>
          <input className="msh-input min-w-52" aria-label="Search reservations" placeholder="Reservation or guest…" value={searchValue} onChange={(event) => setSearchValue(event.target.value)} />
          <button type="submit" className="msh-btn msh-btn-outline">Search</button>
        </form>
        <label className="sr-only" htmlFor="reservation-status-filter">Filter by status</label>
        <select id="reservation-status-filter" className="msh-input" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {statuses.map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}
        </select>
        <button type="button" className="msh-btn msh-btn-outline" disabled={loading} onClick={() => void load()}>{loading ? "Loading…" : "Refresh"}</button>
      </div>
    </div>

    {error && <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[1080px] text-sm">
        <thead className="bg-[hsl(var(--muted))] text-left"><tr>
          <th className="p-3">Reservation</th><th className="p-3">Guest</th><th className="p-3">Room</th><th className="p-3">Stay</th><th className="p-3">Status</th><th className="p-3">Payment</th><th className="p-3">Guests</th><th className="p-3">Source</th><th className="p-3" />
        </tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={9} className="p-6 text-center text-slate-500">Loading reservations…</td></tr> : result?.items.map((reservation) => {
            const payment = paymentSummary(reservation);
            return <tr key={reservation.id} className="border-t hover:bg-slate-50">
            <td className="p-3 font-mono text-xs">{reservation.reservationNumber}</td>
            <td className="p-3"><div className="font-medium">{reservation.guest.firstName} {reservation.guest.lastName}</div><div className="text-xs text-slate-500">{reservation.guest.email || reservation.guest.phone || "No contact details"}</div></td>
            <td className="p-3">{reservation.room ? <><div className="font-medium">{reservation.room.number}</div><div className="text-xs text-slate-500">{reservation.room.roomType.name}</div></> : <><div>Unassigned</div><div className="text-xs text-slate-500">{reservation.ratePlan.roomType.name}</div></>}</td>
            <td className="p-3 whitespace-nowrap">{dateLabel(reservation.checkInDate)}<div className="text-xs text-slate-500">to {dateLabel(reservation.checkOutDate)}</div></td>
            <td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyle[reservation.status]}`}>{reservation.status.replace(/_/g, " ")}</span></td>
            <td className="p-3 whitespace-nowrap"><div className={`text-xs font-semibold ${payment.state === "UNPAID" ? "text-amber-700" : "text-emerald-700"}`}>{payment.state}</div><div className="text-xs text-slate-500">${payment.paid.toFixed(2)} / ${payment.expected.toFixed(2)}</div></td>
            <td className="p-3 whitespace-nowrap">{reservation.adults} adult{reservation.adults === 1 ? "" : "s"}{reservation.children ? `, ${reservation.children} child${reservation.children === 1 ? "" : "ren"}` : ""}</td>
            <td className="p-3">{reservation.source.replace(/_/g, " ")}</td>
            <td className="p-3 text-right"><button type="button" className="msh-btn msh-btn-outline text-xs" onClick={() => setSelected(reservation)}>Details</button></td>
          </tr>;})}
          {!loading && result?.items.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-slate-500">No reservations match those filters.</td></tr>}
        </tbody>
      </table>
    </div>

    <div className="flex items-center justify-between text-sm"><span>{result?.total ?? 0} reservation{result?.total === 1 ? "" : "s"} · Page {page} of {pageCount}</span><div className="flex gap-2"><button type="button" className="msh-btn msh-btn-outline text-xs" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button><button type="button" className="msh-btn msh-btn-outline text-xs" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>

    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="reservation-details-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3"><div><h3 id="reservation-details-title" className="text-lg font-semibold">{selected.guest.firstName} {selected.guest.lastName}</h3><p className="text-sm text-slate-500">{selected.reservationNumber}</p></div><button type="button" className="msh-btn msh-btn-outline text-sm" onClick={() => { setSelected(null); setEditOpen(false); setCancelOpen(false); setCheckInOpen(false); }}>Close</button></div>
        {editOpen ? <form onSubmit={(event) => void saveReservationEdit(event)} className="mt-4 space-y-3">
          <h4 className="font-semibold">Edit reservation</h4>
          {editLoading ? <p className="text-sm text-slate-500">Loading guest and room options…</p> : <>
            <label className="block text-sm">Guest<select className="msh-input mt-1" required value={editForm.guestId} onChange={(event) => setEditForm({ ...editForm, guestId: event.target.value })}>{editGuests.map((guest) => <option key={guest.id} value={guest.id}>{guest.firstName} {guest.lastName}</option>)}</select></label>
            <label className="block text-sm">Room<select className="msh-input mt-1" value={editForm.roomId} onChange={(event) => setEditForm({ ...editForm, roomId: event.target.value })}><option value="">Unassigned</option>{rooms.filter((room) => room.roomTypeId === selected.ratePlan.roomTypeId).map((room) => <option key={room.id} value={room.id}>Room {room.number} · {room.status.replace(/_/g, " ")}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-3"><label className="block text-sm">Check-in<input className="msh-input mt-1" required type="date" value={editForm.checkInDate} onChange={(event) => setEditForm({ ...editForm, checkInDate: event.target.value })} /></label><label className="block text-sm">Check-out<input className="msh-input mt-1" required type="date" min={editForm.checkInDate} value={editForm.checkOutDate} onChange={(event) => setEditForm({ ...editForm, checkOutDate: event.target.value })} /></label></div>
            <div className="grid grid-cols-2 gap-3"><label className="block text-sm">Adults<input className="msh-input mt-1" required type="number" min={1} value={editForm.adults} onChange={(event) => setEditForm({ ...editForm, adults: Number(event.target.value) })} /></label><label className="block text-sm">Children<input className="msh-input mt-1" required type="number" min={0} value={editForm.children} onChange={(event) => setEditForm({ ...editForm, children: Number(event.target.value) })} /></label></div>
            <label className="block text-sm">Special requests<textarea className="msh-input mt-1 min-h-20" value={editForm.specialRequests} onChange={(event) => setEditForm({ ...editForm, specialRequests: event.target.value })} /></label>
            <div className="flex justify-end gap-2"><button type="button" className="msh-btn msh-btn-outline" disabled={savingEdit} onClick={() => setEditOpen(false)}>Back</button><button type="submit" className="msh-btn msh-btn-primary" disabled={savingEdit}>{savingEdit ? "Saving…" : "Save changes"}</button></div>
          </>}
        </form> : <>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Info label="Status" value={selected.status.replace(/_/g, " ")} /><Info label="Room" value={selected.room?.number ?? "Unassigned"} />
            <Info label="Room type" value={selected.ratePlan.roomType.name} /><Info label="Rate plan" value={selected.ratePlan.name} />
            <Info label="Check-in" value={dateLabel(selected.checkInDate)} /><Info label="Check-out" value={dateLabel(selected.checkOutDate)} />
            <Info label="Email" value={selected.guest.email || "—"} /><Info label="Phone" value={selected.guest.phone || "—"} />
            <Info label="Adults" value={String(selected.adults)} /><Info label="Children" value={String(selected.children)} />
            <Info label="Booking source" value={selected.source.replace(/_/g, " ")} />
          </dl>
          {(() => { const payment = paymentSummary(selected); return <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm"><div className="font-semibold">Payment: {payment.state}</div><div className="text-slate-600">${payment.paid.toFixed(2)} paid of ${payment.expected.toFixed(2)} expected</div>{payment.paid <= 0 && <p className="mt-1 text-xs text-amber-700">A payment must be recorded before the reservation can be confirmed or checked in.</p>}</div>; })()}
          {error && <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {!(["CANCELLED", "NO_SHOW"] as ReservationStatus[]).includes(selected.status) && <button type="button" className="msh-btn msh-btn-outline" onClick={() => openReservationProforma(selected.id)}>Pro forma invoice</button>}
            {!["CANCELLED", "NO_SHOW", "CHECKED_OUT"].includes(selected.status) && <button type="button" className="msh-btn msh-btn-outline" disabled={!selected.folios[0]} onClick={() => { setPaymentOpen((value) => !value); setPaymentForm({ description: `Reservation payment ${selected.reservationNumber}`, amount: "", paymentMethod: "CASH" }); }}>Record payment</button>}
            {(["TENTATIVE", "CONFIRMED"] as ReservationStatus[]).includes(selected.status) && <button type="button" className="msh-btn msh-btn-outline" onClick={() => void beginEdit()}>Edit</button>}
            {(["TENTATIVE", "CONFIRMED"] as ReservationStatus[]).includes(selected.status) && <button type="button" className="msh-btn msh-btn-primary" disabled={paymentSummary(selected).paid <= 0 || selected.checkInDate.slice(0, 10) > new Date().toISOString().slice(0, 10)} onClick={() => void beginCheckIn()} title={paymentSummary(selected).paid <= 0 ? "Record a payment before check-in" : "Check in guest"}>Check in</button>}
            {!(["CHECKED_OUT", "CANCELLED", "NO_SHOW"] as ReservationStatus[]).includes(selected.status) && <button type="button" className="msh-btn border border-red-300 text-red-700" onClick={() => { setCancelOpen((value) => !value); setCancelReason(""); setError(""); }}>Cancel reservation</button>}
          </div>
          {paymentOpen && <form onSubmit={(event) => void recordPayment(event)} className="mt-4 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><h4 className="font-semibold text-sm">Record reservation payment</h4><label className="block text-sm">Amount<input className="msh-input mt-1" required type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} /></label><label className="block text-sm">Payment method<select className="msh-input mt-1" value={paymentForm.paymentMethod} onChange={(event) => setPaymentForm({ ...paymentForm, paymentMethod: event.target.value })}>{["CASH", "CARD", "MOBILE", "BANK_TRANSFER", "ECOCASH", "ONEMONEY", "ROOM_CHARGE"].map((method) => <option key={method} value={method}>{method.replace(/_/g, " ")}</option>)}</select></label><label className="block text-sm">Description<input className="msh-input mt-1" required minLength={1} value={paymentForm.description} onChange={(event) => setPaymentForm({ ...paymentForm, description: event.target.value })} /></label><div className="flex justify-end gap-2"><button type="button" className="msh-btn msh-btn-outline" disabled={savingPayment} onClick={() => setPaymentOpen(false)}>Cancel</button><button type="submit" className="msh-btn msh-btn-primary" disabled={savingPayment || Number(paymentForm.amount) <= 0 || !paymentForm.description.trim()}>{savingPayment ? "Saving…" : "Save payment"}</button></div></form>}
          {cancelOpen && <form onSubmit={(event) => void cancelSelected(event)} className="mt-4 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3"><label className="block text-sm">Cancellation reason<textarea required minLength={3} className="msh-input mt-1 min-h-20" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></label><div className="flex justify-end gap-2"><button type="button" className="msh-btn msh-btn-outline" disabled={savingCancel} onClick={() => setCancelOpen(false)}>Keep reservation</button><button type="submit" className="msh-btn border border-red-300 text-red-700" disabled={savingCancel || cancelReason.trim().length < 3}>{savingCancel ? "Cancelling…" : "Confirm cancellation"}</button></div></form>}
          {checkInOpen && <form onSubmit={(event) => void checkInSelected(event)} className="mt-4 space-y-2 rounded-lg border p-3"><label className="block text-sm">Inspected room<select required className="msh-input mt-1" value={checkInRoomId} onChange={(event) => setCheckInRoomId(event.target.value)}><option value="">Select room</option>{checkInRooms.map((room) => <option key={room.id} value={room.id}>Room {room.number}</option>)}</select></label>{!checkInRooms.length && <p className="text-sm text-amber-700">No inspected rooms of this room type are available.</p>}<div className="flex justify-end gap-2"><button type="button" className="msh-btn msh-btn-outline" disabled={savingCheckIn} onClick={() => setCheckInOpen(false)}>Back</button><button type="submit" className="msh-btn msh-btn-primary" disabled={savingCheckIn || !checkInRoomId}>{savingCheckIn ? "Checking in…" : "Confirm check-in"}</button></div></form>}
        </>}
      </section>
    </div>}
  </div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>;
}
