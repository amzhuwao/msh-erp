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
  company: { companyName: string } | null;
  guests: { id: string; fullName: string; nationality: string | null; roomTypeCode: string | null; checkInStatus: string }[];
  roomAllocations: { id: string; room: { number: string }; roomType: { code: string }; rate: string; assignedGuestName: string | null; status: string }[];
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
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState("");
  const [importText, setImportText] = useState("");
  const [newGuestName, setNewGuestName] = useState("");

  function load() {
    apiFetch<GroupDetail>(`/api/group-reservations/${id}`).then(setGroup);
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
    if (!newGuestName.trim()) return;
    await apiFetch(`/api/group-reservations/${id}/guests`, {
      method: "POST",
      body: JSON.stringify({ fullName: newGuestName }),
    });
    setNewGuestName("");
    load();
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

  if (!group) return <div className="p-6 text-slate-500">Loading…</div>;

  const allocatedIds = new Set(group.roomAllocations.map((a) => a.room.number));

  return (
    <div className="p-6">
      <Link href="/dashboard/groups" className="text-sm text-slate-400 hover:text-slate-600">← Back to groups</Link>

      <div className="flex items-start justify-between mt-4 mb-6">
        <div>
          <div className="text-xs font-mono text-[#4a90a4]">{group.groupCode}</div>
          <h1 className="text-2xl font-semibold text-[#0f2744]">{group.groupName}</h1>
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
          <span className={`px-3 py-2 rounded-lg text-sm font-medium ${
            group.status === "CONFIRMED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
          }`}>
            {group.status}
          </span>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-semibold text-[#0f2744] mb-3">
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
              <button onClick={allocateRoom} className="bg-[#0f2744] text-white px-4 py-2 rounded-lg text-sm">Allocate</button>
            </div>
          )}
          <ul className="space-y-2 text-sm">
            {group.roomAllocations.map((a) => (
              <li key={a.id} className="flex justify-between border-b border-slate-100 py-2">
                <span>Room <strong>{a.room.number}</strong> ({a.roomType.code})</span>
                <span className="text-slate-500">${Number(a.rate).toFixed(2)}/night · {a.status}</span>
              </li>
            ))}
            {group.roomAllocations.length === 0 && <li className="text-slate-400">No rooms allocated yet.</li>}
          </ul>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-semibold text-[#0f2744] mb-3">Guest List ({group.guests.length})</h2>
          <div className="flex gap-2 mb-4">
            <input
              placeholder="Guest full name"
              className="border rounded-lg px-3 py-2 text-sm flex-1"
              value={newGuestName}
              onChange={(e) => setNewGuestName(e.target.value)}
            />
            <button onClick={addGuest} className="bg-[#0f2744] text-white px-4 py-2 rounded-lg text-sm">Add</button>
          </div>
          <ul className="space-y-1 text-sm max-h-48 overflow-y-auto">
            {group.guests.map((g) => (
              <li key={g.id} className="flex justify-between py-1.5 border-b border-slate-50">
                <span>{g.fullName}</span>
                <span className="text-slate-400 text-xs">{g.roomTypeCode ?? "—"} · {g.checkInStatus}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 p-4 mt-6">
        <h2 className="font-semibold text-[#0f2744] mb-2">Import Rooming List (CSV)</h2>
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
