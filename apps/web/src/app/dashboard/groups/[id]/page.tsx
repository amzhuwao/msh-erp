"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface GroupDetail {
  id: string;
  groupCode: string;
  groupName: string;
  status: string;
  arrivalDate: string;
  departureDate: string;
  roomCount: number;
  adults: number;
  contactPerson: string;
  phone: string;
  email: string;
  specialRequests: string | null;
  depositAmount: string;
  balance: string;
  company: { companyName: string } | null;
  guests: {
    id: string;
    fullName: string;
    nationality: string | null;
    roomTypeCode: string | null;
    roomNumber: string | null;
    checkInStatus: string;
    nationalId: string | null;
    passportNumber: string | null;
  }[];
  roomAllocations: {
    id: string;
    roomId: string;
    room: { number: string; id: string };
    roomType: { code: string };
    rate: string;
    assignedGuestName: string | null;
    status: string;
  }[];
  reservations: { id: string; reservationNumber: string; status: string; guest: { firstName: string; lastName: string }; room: { number: string } | null }[];
}

interface GroupFolio {
  balance: number;
  totalCharges: number;
  totalInvoiced: number;
  outstanding: number;
  charges: { id: string; chargeType: string; amount: string; paidBy: string; invoiceId: string | null; chargeDate: string }[];
  invoices: { id: string; invoiceType: string; amount: string; outstanding: string; status: string }[];
  payments: { id: string; type: string; amount: string; paymentMethod: string; reference: string | null; createdAt: string }[];
}

interface Room {
  id: string;
  number: string;
  roomType: { code: string; baseRate: string };
}

export default function GroupDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [folio, setFolio] = useState<GroupFolio | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState("");
  const [importText, setImportText] = useState("");
  const [guestForm, setGuestForm] = useState({
    fullName: "",
    nationality: "",
    nationalId: "",
    passportNumber: "",
    roomTypeCode: "",
    vipStatus: "NONE",
    notes: "",
  });
  const [guestError, setGuestError] = useState("");
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [assigningRoom, setAssigningRoom] = useState<string | null>(null);
  const [bulkCheckingIn, setBulkCheckingIn] = useState(false);
  const [chargeType, setChargeType] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargePaidBy, setChargePaidBy] = useState("MASTER");
  const [invoicePaidBy, setInvoicePaidBy] = useState("MASTER");
  const [depositAmount, setDepositAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [selectedInvoice, setSelectedInvoice] = useState("");

  function load() {
    apiFetch<GroupDetail>(`/api/group-reservations/${id}`).then(setGroup);
    apiFetch<GroupFolio>(`/api/group-reservations/${id}/folio`).then(setFolio);
  }

  async function submitGroupAction(path: string, body: Record<string, unknown>, success: string) {
    try {
      await apiFetch(`/api/group-reservations/${id}/${path}`, { method: "POST", body: JSON.stringify(body) });
      load();
      alert(success);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not complete the group billing action");
    }
  }

  async function checkOutReservation(reservationId: string) {
    try {
      await apiFetch(`/api/group-reservations/${id}/checkout/${reservationId}`, { method: "POST" });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Check-out failed");
    }
  }

  async function closeGroup() {
    if (!confirm("Close this group reservation?")) return;
    await submitGroupAction("close", {}, "Group reservation closed");
  }

  useEffect(() => {
    load();
    apiFetch<{ items: Room[] }>("/api/rooms").then((d) => setRooms(d.items));
  }, [id]);

  async function confirmGroup() {
    if (!confirm("Confirm this group booking?")) return;
    await apiFetch(`/api/group-reservations/${id}/confirm`, { method: "POST" });
    load();
  }

  async function allocateRoom() {
    if (!selectedRoom) return;
    const room = rooms.find((r) => r.id === selectedRoom);
    if (!room) return;
    await apiFetch(`/api/group-reservations/${id}/allocate-room`, {
      method: "POST",
      body: JSON.stringify({ roomId: selectedRoom, rate: Number(room.roomType.baseRate) }),
    });
    setSelectedRoom("");
    load();
  }

  async function addGuest() {
    setGuestError("");
    try {
      await apiFetch(`/api/group-reservations/${id}/guests`, {
        method: "POST",
        body: JSON.stringify({
          ...guestForm,
          fullName: guestForm.fullName.trim(),
          nationality: guestForm.nationality.trim(),
          nationalId: guestForm.nationalId.trim() || undefined,
          passportNumber: guestForm.passportNumber.trim() || undefined,
          roomTypeCode: guestForm.roomTypeCode.trim() || undefined,
          notes: guestForm.notes.trim() || undefined,
        }),
      });
      setGuestForm({ fullName: "", nationality: "", nationalId: "", passportNumber: "", roomTypeCode: "", vipStatus: "NONE", notes: "" });
      load();
    } catch (err) {
      setGuestError(err instanceof Error ? err.message : "Failed to add guest");
    }
  }

  async function importCsv() {
    const lines = importText.trim().split("\n").filter(Boolean);
    const rows = lines.map((line) => {
      const [fullName, nationality, nationalId, passportNumber, roomTypeCode, vipStatus, notes] = line.split(",").map((s) => s.trim());
      return { fullName, nationality, nationalId, passportNumber, roomTypeCode, vipStatus, notes };
    });
    const result = await apiFetch<{ imported: number; errors: { row: number; message: string }[] }>(
      `/api/group-reservations/${id}/import-rooming-list`,
      { method: "POST", body: JSON.stringify({ rows }) },
    );
    alert(`Imported ${result.imported} guests${result.errors.length ? `, ${result.errors.length} errors` : ""}`);
    setImportText("");
    load();
  }

  async function checkInGuest(guestId: string, roomId?: string) {
    setCheckingIn(guestId);
    try {
      await apiFetch(`/api/group-reservations/${id}/checkin-guest/${guestId}`, {
        method: "POST",
        body: JSON.stringify(roomId ? { roomId } : {}),
      });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setCheckingIn(null);
    }
  }

  async function assignGuestRoom(guestId: string, roomId: string) {
    setAssigningRoom(guestId);
    try {
      await apiFetch(`/api/group-reservations/${id}/guests/${guestId}/room`, {
        method: "POST",
        body: JSON.stringify({ roomId: roomId || null }),
      });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Room assignment failed");
    } finally {
      setAssigningRoom(null);
    }
  }

  async function checkInAll() {
    if (!confirm("Check in all pending guests?")) return;
    setBulkCheckingIn(true);
    try {
      const result = await apiFetch<{ succeeded: number; failed: number; results: { fullName: string; success: boolean; error?: string }[] }>(
        `/api/group-reservations/${id}/checkin-all`,
        { method: "POST" },
      );
      alert(`Checked in ${result.succeeded} of ${result.succeeded + result.failed} guests`);
      if (result.failed > 0) {
        const failed = result.results.filter((r) => !r.success).map((r) => `${r.fullName}: ${r.error}`).join("\n");
        console.warn(failed);
      }
      load();
    } finally {
      setBulkCheckingIn(false);
    }
  }

  if (!group) return <div className="p-6 text-slate-500">Loading…</div>;

  const allocatedIds = new Set(group.roomAllocations.map((a) => a.room.number));
  const pendingGuests = group.guests.filter((g) => g.checkInStatus === "PENDING");
  const canCheckIn = group.status === "CONFIRMED" && group.roomAllocations.length > 0;

  return (
    <div className="p-6">
      <Link href="/dashboard/groups" className="text-sm text-slate-400 hover:text-slate-600">← Back to groups</Link>

      <div className="flex items-start justify-between mt-4 mb-6">
        <div>
          <div className="text-xs font-mono text-[hsl(var(--accent))]">{group.groupCode}</div>
          <h1 className="text-2xl font-semibold text-[hsl(var(--primary))]">{group.groupName}</h1>
          <p className="text-slate-500 text-sm mt-1">
            {group.company?.companyName ?? "No company"} · {group.contactPerson} · {group.phone}
          </p>
          <p className="text-sm mt-1">
            {group.arrivalDate.slice(0, 10)} → {group.departureDate.slice(0, 10)} · {group.adults} adults · {group.roomCount} rooms
          </p>
        </div>
        <div className="flex gap-2">
          {group.status === "TENTATIVE" && (
            <button onClick={confirmGroup} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm">
              Confirm Booking
            </button>
          )}
          {canCheckIn && pendingGuests.length > 0 && (
            <button
              onClick={checkInAll}
              disabled={bulkCheckingIn}
              className="bg-[hsl(var(--accent))] text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {bulkCheckingIn ? "Checking in…" : `Check In All (${pendingGuests.length})`}
            </button>
          )}
          {group.status === "CONFIRMED" && (
            <button onClick={closeGroup} className="border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm">Close Group</button>
          )}
          <span className={`px-3 py-2 rounded-lg text-sm font-medium ${
            group.status === "CONFIRMED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
          }`}>
            {group.status}
          </span>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border border-[hsl(var(--border))] p-4">
          <h2 className="font-semibold text-[hsl(var(--primary))] mb-3">
            Room Allocations ({group.roomAllocations.length}/{group.roomCount})
          </h2>
          {group.status !== "CANCELLED" && group.roomAllocations.length < group.roomCount && (
            <div className="flex gap-2 mb-4">
              <select className="border rounded-lg px-3 py-2 text-sm flex-1" value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)}>
                <option value="">Select room…</option>
                {rooms.filter((r) => !allocatedIds.has(r.number)).map((r) => (
                  <option key={r.id} value={r.id}>Room {r.number} ({r.roomType.code})</option>
                ))}
              </select>
              <button onClick={allocateRoom} className="bg-[hsl(var(--primary))] text-white px-4 py-2 rounded-lg text-sm">Allocate</button>
            </div>
          )}
          <ul className="space-y-2 text-sm">
            {group.roomAllocations.map((a) => (
              <li key={a.id} className="flex justify-between border-b border-[hsl(var(--border))] py-2">
                <span>
                  Room <strong>{a.room.number}</strong> ({a.roomType.code})
                  {a.assignedGuestName && <span className="text-slate-400 ml-2">→ {a.assignedGuestName}</span>}
                </span>
                <span className="text-slate-500">${Number(a.rate).toFixed(2)}/night · {a.status}</span>
              </li>
            ))}
            {group.roomAllocations.length === 0 && <li className="text-slate-400">No rooms allocated yet.</li>}
          </ul>
        </section>

        <section className="bg-white rounded-xl border border-[hsl(var(--border))] p-4">
          <h2 className="font-semibold text-[hsl(var(--primary))] mb-3">Guest List ({group.guests.length})</h2>
          <div className="grid sm:grid-cols-2 gap-2 mb-4">
            <input
              placeholder="Guest full name"
              aria-label="Guest full name"
              className="border rounded-lg px-3 py-2 text-sm"
              value={guestForm.fullName}
              onChange={(e) => setGuestForm({ ...guestForm, fullName: e.target.value })}
            />
            <input
              placeholder="Nationality"
              aria-label="Nationality"
              className="border rounded-lg px-3 py-2 text-sm"
              value={guestForm.nationality}
              onChange={(e) => setGuestForm({ ...guestForm, nationality: e.target.value })}
            />
            <input
              placeholder="National ID (or passport below)"
              aria-label="National ID"
              className="border rounded-lg px-3 py-2 text-sm"
              value={guestForm.nationalId}
              onChange={(e) => setGuestForm({ ...guestForm, nationalId: e.target.value })}
            />
            <input
              placeholder="Passport number (or national ID above)"
              aria-label="Passport number"
              className="border rounded-lg px-3 py-2 text-sm"
              value={guestForm.passportNumber}
              onChange={(e) => setGuestForm({ ...guestForm, passportNumber: e.target.value })}
            />
            <input
              placeholder="Room type code (optional)"
              aria-label="Room type code"
              className="border rounded-lg px-3 py-2 text-sm"
              value={guestForm.roomTypeCode}
              onChange={(e) => setGuestForm({ ...guestForm, roomTypeCode: e.target.value })}
            />
            <select
              aria-label="VIP status"
              className="border rounded-lg px-3 py-2 text-sm"
              value={guestForm.vipStatus}
              onChange={(e) => setGuestForm({ ...guestForm, vipStatus: e.target.value })}
            >
              <option value="NONE">Standard guest</option>
              <option value="VIP1">VIP 1</option>
              <option value="VIP2">VIP 2</option>
              <option value="VIP3">VIP 3</option>
            </select>
            <input
              placeholder="Special notes (optional)"
              aria-label="Special notes"
              className="border rounded-lg px-3 py-2 text-sm sm:col-span-2"
              value={guestForm.notes}
              onChange={(e) => setGuestForm({ ...guestForm, notes: e.target.value })}
            />
            {guestError && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{guestError}</p>}
            <button
              onClick={addGuest}
              disabled={!guestForm.fullName.trim() || !guestForm.nationality.trim() || (!guestForm.nationalId.trim() && !guestForm.passportNumber.trim())}
              className="bg-[hsl(var(--primary))] text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50 sm:col-span-2"
            >
              Add guest
            </button>
          </div>
          <ul className="space-y-2 text-sm max-h-64 overflow-y-auto">
            {group.guests.map((g) => (
              <li key={g.id} className="flex items-center justify-between py-2 border-b border-slate-50">
                <div>
                  <span className="font-medium">{g.fullName}</span>
                  <div className="text-xs text-slate-400">
                    {g.roomTypeCode ?? "—"} · {g.checkInStatus}
                    {g.roomNumber && ` · Room ${g.roomNumber}`}
                  </div>
                </div>
                {g.checkInStatus === "PENDING" && (
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`Room for ${g.fullName}`}
                      className="border rounded px-2 py-1.5 text-xs"
                      value={group.roomAllocations.find((allocation) => allocation.room.number === g.roomNumber)?.roomId ?? ""}
                      disabled={assigningRoom === g.id || group.status === "CLOSED" || group.status === "CANCELLED"}
                      onChange={(e) => assignGuestRoom(g.id, e.target.value)}
                    >
                      <option value="">Auto assign</option>
                      {group.roomAllocations
                        .filter((allocation) => !group.guests.some((other) => other.id !== g.id && other.checkInStatus !== "CHECKED_OUT" && other.roomNumber === allocation.room.number))
                        .map((allocation) => (
                            <option key={allocation.roomId} value={allocation.roomId}>
                            Room {allocation.room.number} ({allocation.roomType.code})
                          </option>
                        ))}
                    </select>
                    {canCheckIn && (
                      <button
                        onClick={() => checkInGuest(g.id)}
                        disabled={checkingIn === g.id || assigningRoom === g.id || !(g.nationalId || g.passportNumber)}
                        title={!(g.nationalId || g.passportNumber) ? "National ID or passport required" : undefined}
                        className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded disabled:opacity-40"
                      >
                        {checkingIn === g.id ? "…" : "Check In"}
                      </button>
                    )}
                  </div>
                )}
                {g.checkInStatus === "CHECKED_IN" && (
                  <span className="text-xs text-emerald-600 font-medium">Checked In</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {group.reservations.length > 0 && (
        <section className="bg-white rounded-xl border border-[hsl(var(--border))] p-4 mt-6">
          <h2 className="font-semibold text-[hsl(var(--primary))] mb-3">Individual Reservations</h2>
          <ul className="space-y-1 text-sm">
            {group.reservations.map((r) => (
              <li key={r.id} className="flex justify-between py-1.5 border-b border-slate-50">
                <span>{r.reservationNumber} — {r.guest.firstName} {r.guest.lastName}</span>
                <span className="flex items-center gap-3 text-slate-400">Room {r.room?.number ?? "—"} · {r.status}
                  {r.status === "CHECKED_IN" && <button onClick={() => checkOutReservation(r.id)} className="text-xs bg-slate-700 text-white rounded px-2 py-1">Check out</button>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-white rounded-xl border border-[hsl(var(--border))] p-4 mt-6">
        <div className="flex flex-wrap justify-between gap-3 items-center mb-4">
          <div><h2 className="font-semibold text-[hsl(var(--primary))]">Group Billing</h2><p className="text-sm text-slate-500">Charges ${folio?.totalCharges.toFixed(2) ?? "0.00"} · Balance ${folio?.balance.toFixed(2) ?? "0.00"} · Deposits ${Number(group.depositAmount).toFixed(2)}</p></div>
          <div className="flex gap-2">
            <select className="border rounded-lg px-2 py-2 text-sm" value={invoicePaidBy} onChange={(e) => setInvoicePaidBy(e.target.value)} aria-label="Invoice payer"><option value="MASTER">Master account</option><option value="COMPANY">Company</option><option value="SPONSOR">Sponsor</option></select>
            <button onClick={() => submitGroupAction("invoices", { invoiceType: invoicePaidBy, paidBy: invoicePaidBy }, `Invoice created for ${invoicePaidBy.toLowerCase()} charges`)} className="bg-[hsl(var(--primary))] text-white px-3 py-2 rounded-lg text-sm">Create invoice</button>
          </div>
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void submitGroupAction("charges", { chargeType, amount: Number(chargeAmount), paidBy: chargePaidBy }, "Charge added"); setChargeType(""); setChargeAmount(""); }}>
            <h3 className="text-sm font-medium">Add master charge</h3>
            <input className="border rounded-lg px-3 py-2 text-sm w-full" placeholder="Description" value={chargeType} onChange={(e) => setChargeType(e.target.value)} required />
            <input className="border rounded-lg px-3 py-2 text-sm w-full" placeholder="Amount" type="number" min="0.01" step="0.01" value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)} required />
            <select className="border rounded-lg px-3 py-2 text-sm w-full" value={chargePaidBy} onChange={(e) => setChargePaidBy(e.target.value)}><option value="MASTER">Master account</option><option value="COMPANY">Company</option><option value="SPONSOR">Sponsor</option></select>
            <button className="border rounded-lg px-3 py-2 text-sm">Add charge</button>
          </form>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void submitGroupAction("payments", { type: "DEPOSIT", amount: Number(depositAmount), paymentMethod, reference: "" }, "Deposit recorded"); setDepositAmount(""); }}>
            <h3 className="text-sm font-medium">Record deposit</h3>
            <input className="border rounded-lg px-3 py-2 text-sm w-full" placeholder="Amount" type="number" min="0.01" step="0.01" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} required />
            <select className="border rounded-lg px-3 py-2 text-sm w-full" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option>CASH</option><option>CARD</option><option>BANK_TRANSFER</option><option>MOBILE</option></select>
            <button className="border rounded-lg px-3 py-2 text-sm">Record deposit</button>
          </form>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void submitGroupAction("payments", { type: "INVOICE_PAYMENT", invoiceId: selectedInvoice, amount: Number(paymentAmount), paymentMethod }, "Invoice payment recorded"); setPaymentAmount(""); }}>
            <h3 className="text-sm font-medium">Pay invoice</h3>
            <select className="border rounded-lg px-3 py-2 text-sm w-full" value={selectedInvoice} onChange={(e) => setSelectedInvoice(e.target.value)} required><option value="">Select open invoice…</option>{folio?.invoices.filter((invoice) => Number(invoice.outstanding) > 0.01).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceType} · ${Number(invoice.outstanding).toFixed(2)}</option>)}</select>
            <input className="border rounded-lg px-3 py-2 text-sm w-full" placeholder="Amount" type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} required />
            <button className="border rounded-lg px-3 py-2 text-sm">Record payment</button>
          </form>
        </div>
        <div className="grid lg:grid-cols-2 gap-6 mt-6">
          <div><h3 className="text-sm font-medium mb-2">Invoices</h3><ul className="text-sm space-y-2">{folio?.invoices.map((invoice) => <li key={invoice.id} className="flex justify-between border-b py-2"><span>{invoice.invoiceType} · {invoice.status}</span><span>${Number(invoice.amount).toFixed(2)} · due ${Number(invoice.outstanding).toFixed(2)}</span></li>)}{!folio?.invoices.length && <li className="text-slate-400">No invoices yet.</li>}</ul></div>
          <div><h3 className="text-sm font-medium mb-2">Charges and payments</h3><ul className="text-sm space-y-2 max-h-48 overflow-y-auto">{folio?.charges.map((charge) => <li key={charge.id} className="flex justify-between border-b py-2"><span>{charge.chargeType} · {charge.paidBy}</span><span>${Number(charge.amount).toFixed(2)}</span></li>)}{folio?.payments.map((payment) => <li key={payment.id} className="flex justify-between border-b py-2 text-emerald-700"><span>{payment.type.replace("_", " ")} · {payment.paymentMethod}</span><span>−${Number(payment.amount).toFixed(2)}</span></li>)}{!folio?.charges.length && !folio?.payments.length && <li className="text-slate-400">No charges or payments yet.</li>}</ul></div>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-[hsl(var(--border))] p-4 mt-6">
        <h2 className="font-semibold text-[hsl(var(--primary))] mb-2">Import Rooming List (CSV)</h2>
        <p className="text-xs text-slate-500 mb-2">
          Format: FullName, Nationality, NationalID, Passport, RoomType, VIP, Notes (one guest per line)
        </p>
        <textarea
          className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
          rows={4}
          placeholder="Dr. Jane Doe, Zimbabwe, 63-1234567A12, , DLX, VIP1, Gluten-free"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
        <button onClick={importCsv} className="mt-2 bg-slate-700 text-white px-4 py-2 rounded-lg text-sm">Import</button>
      </section>

      {group.specialRequests && (
        <p className="mt-4 text-sm text-slate-600 bg-amber-50 border border-amber-100 rounded-lg p-3">
          <strong>Special requests:</strong> {group.specialRequests}
        </p>
      )}
    </div>
  );
}
