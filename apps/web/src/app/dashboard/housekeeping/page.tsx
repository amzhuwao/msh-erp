"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, getStoredUser, type AuthUser } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Room {
  id: string; number: string; floor: number; status: string;
  roomType: { code: string; name: string };
  reservations: { guest: { lastName: string } }[];
}
interface Attendant { id: string; fullName: string }
interface Assignment { id: string; roomId: string; attendantUserId: string; status: string; room: Room; attendant: Attendant }
interface LostFound { id: string; itemDescription: string; locationFound: string; dateFound: string; storageLocation: string | null; status: string; claimedBy: string | null; foundBy: { fullName: string } }
interface Dashboard { rooms: Room[]; summary: Record<string, number>; assignments: Assignment[]; attendants: Attendant[]; lostAndFound: LostFound[]; openCleaningLogs: { roomId: string; startTime: string }[] }
interface SupplyConfig { items: { id: string; itemCode: string; name: string; baseUnitOfMeasure: string }[]; locations: { id: string; locationName: string }[]; standards: { id: string; quantityPerRoom: string; item: { name: string; baseUnitOfMeasure: string }; storeLocation: { locationName: string } }[] }
interface SupplyIssue { id: string; issueNumber: string; date: string; roomCount: number; status: string; attendant: Attendant; createdBy: { id: string; fullName: string }; approvedBy: { fullName: string } | null; lines: { id: string; quantity: string; item: { name: string; baseUnitOfMeasure: string }; storeLocation: { locationName: string } }[] }

const actions: Record<string, { label: string; status: string }[]> = {
  VACANT_DIRTY: [{ label: "Start cleaning", status: "CLEANING_IN_PROGRESS" }],
  OCCUPIED_DIRTY: [{ label: "Start cleaning", status: "CLEANING_IN_PROGRESS" }],
  CLEANING_IN_PROGRESS: [{ label: "Finish cleaning", status: "VACANT_CLEAN" }],
  VACANT_CLEAN: [{ label: "Inspect room", status: "INSPECTED" }, { label: "Reject inspection", status: "VACANT_DIRTY" }],
  INSPECTED: [{ label: "Mark out of order", status: "OUT_OF_ORDER" }, { label: "Mark out of service", status: "OUT_OF_SERVICE" }],
  OUT_OF_ORDER: [{ label: "Release to dirty", status: "VACANT_DIRTY" }],
  OUT_OF_SERVICE: [{ label: "Release to dirty", status: "VACANT_DIRTY" }],
  MAINTENANCE: [{ label: "Release to dirty", status: "VACANT_DIRTY" }],
};
const badges: Record<string, string> = {
  INSPECTED: "bg-emerald-100 text-emerald-800", VACANT_CLEAN: "bg-blue-100 text-blue-800",
  CLEANING_IN_PROGRESS: "bg-amber-100 text-amber-800", VACANT_DIRTY: "bg-orange-100 text-orange-800",
  OCCUPIED_DIRTY: "bg-red-100 text-red-800", OCCUPIED: "bg-purple-100 text-purple-800",
  OUT_OF_ORDER: "bg-slate-200 text-slate-600", OUT_OF_SERVICE: "bg-slate-200 text-slate-600", MAINTENANCE: "bg-rose-100 text-rose-800",
};
const isoToday = new Date().toISOString().slice(0, 10);

export default function HousekeepingPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [supplyConfig, setSupplyConfig] = useState<SupplyConfig | null>(null);
  const [supplyIssues, setSupplyIssues] = useState<SupplyIssue[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [tab, setTab] = useState<"rooms" | "lost">("rooms");
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);
  const [attendantId, setAttendantId] = useState("");
  const [assignmentDate, setAssignmentDate] = useState(isoToday);
  const [lostForm, setLostForm] = useState({ itemDescription: "", locationFound: "", storageLocation: "", notes: "" });
  const [lostSearch, setLostSearch] = useState("");
  const [lostStatusFilter, setLostStatusFilter] = useState("ALL");
  const [supplyStandard, setSupplyStandard] = useState({ itemId: "", storeLocationId: "", quantityPerRoom: "1" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const canApproveSupply = !!user?.permissions?.Inventory?.includes("APPROVE");

  async function load() {
    const [result, config, issues] = await Promise.all([
      apiFetch<Dashboard>(`/api/housekeeping/dashboard?date=${assignmentDate}`),
      apiFetch<SupplyConfig>("/api/housekeeping/supply-configuration"),
      apiFetch<{ items: SupplyIssue[] }>(`/api/housekeeping/supply-issues?date=${assignmentDate}`),
    ]);
    setData(result); setSupplyConfig(config); setSupplyIssues(issues.items);
  }
  useEffect(() => { setUser(getStoredUser()); void load().catch((err) => setError(err instanceof Error ? err.message : "Could not load housekeeping")); }, [assignmentDate]);

  async function run(action: () => Promise<void>) {
    setError(""); setBusy(true);
    try { await action(); }
    catch (err) { setError(err instanceof Error ? err.message : "Housekeeping action failed"); }
    finally { setBusy(false); }
  }

  async function changeStatus(room: Room, status: string) {
    const notes = status === "VACANT_DIRTY" ? window.prompt("What needs to be corrected before this room passes inspection?") : undefined;
    if (status === "VACANT_DIRTY" && !notes?.trim()) return;
    await run(async () => {
      await apiFetch(`/api/housekeeping/rooms/${room.id}/status`, { method: "PUT", body: JSON.stringify({ status, notes }) });
      await load();
    });
  }

  async function assignRooms() {
    if (!selectedRooms.length || !attendantId) return;
    await run(async () => {
      await apiFetch("/api/housekeeping/assign-rooms", { method: "POST", body: JSON.stringify({ roomIds: selectedRooms, attendantUserId: attendantId, date: assignmentDate }) });
      setSelectedRooms([]); await load();
    });
  }

  async function saveSupplyStandard(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      await apiFetch("/api/housekeeping/supply-standards", { method: "PUT", body: JSON.stringify({ ...supplyStandard, quantityPerRoom: Number(supplyStandard.quantityPerRoom) }) });
      await load();
    });
  }

  async function removeSupplyStandard(id: string) {
    await run(async () => { await apiFetch(`/api/housekeeping/supply-standards/${id}`, { method: "DELETE" }); await load(); });
  }

  async function generateSupplyIssue(attendantUserId: string) {
    await run(async () => {
      await apiFetch("/api/housekeeping/supply-issues", { method: "POST", body: JSON.stringify({ attendantUserId, date: assignmentDate }) });
      await load();
    });
  }

  async function approveSupplyIssue(id: string) {
    await run(async () => {
      await apiFetch(`/api/housekeeping/supply-issues/${id}/approve`, { method: "PUT" });
      await load();
    });
  }

  async function reportDefect(room: Room) {
    const description = window.prompt(`Describe the defect in room ${room.number}:`);
    if (!description?.trim()) return;
    await run(async () => {
      await apiFetch(`/api/housekeeping/rooms/${room.id}/report-defect`, { method: "POST", body: JSON.stringify({ description, priority: "MEDIUM" }) });
      await load();
    });
  }

  async function createLostItem(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      await apiFetch("/api/housekeeping/lost-and-found", { method: "POST", body: JSON.stringify({ ...lostForm, dateFound: isoToday }) });
      setLostForm({ itemDescription: "", locationFound: "", storageLocation: "", notes: "" }); await load();
    });
  }

  async function disposeLostItem(item: LostFound, status: "CLAIMED" | "DISPOSED" | "DONATED") {
    const claimedBy = status === "CLAIMED" ? window.prompt("Name of the person claiming this item:") : undefined;
    if (status === "CLAIMED" && !claimedBy?.trim()) return;
    await run(async () => {
      await apiFetch(`/api/housekeeping/lost-and-found/${item.id}`, { method: "PUT", body: JSON.stringify({ status, claimedBy }) });
      await load();
    });
  }

  const filtered = useMemo(() => (data?.rooms ?? []).filter((room) => filter === "ALL" || room.status === filter), [data, filter]);
  const assignmentByRoom = new Map((data?.assignments ?? []).map((assignment) => [assignment.roomId, assignment]));
  const assignmentCounts = Object.values(data?.assignments ?? []).reduce<Record<string, number>>((acc, assignment) => { acc[assignment.status] = (acc[assignment.status] ?? 0) + 1; return acc; }, {});
  const filterOptions: [string, number][] = [["ALL", data?.rooms.length ?? 0], ...Object.entries(data?.summary ?? {})];
  const lostItems = (data?.lostAndFound ?? []).filter((item) => (lostStatusFilter === "ALL" || item.status === lostStatusFilter) && `${item.itemDescription} ${item.locationFound} ${item.claimedBy ?? ""} ${item.foundBy.fullName}`.toLowerCase().includes(lostSearch.toLowerCase()));

  return <div className="p-6 space-y-5">
    <PageHeader title="Housekeeping & Room Readiness" description="Daily assignments, cleaning inspections, defects, and lost-and-found records" />
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <div className="flex gap-2 border-b"><button onClick={() => setTab("rooms")} className={`px-3 py-2 text-sm ${tab === "rooms" ? "border-b-2 border-[hsl(var(--primary))] font-semibold" : "text-slate-500"}`}>Rooms and assignments</button><button onClick={() => setTab("lost")} className={`px-3 py-2 text-sm ${tab === "lost" ? "border-b-2 border-[hsl(var(--primary))] font-semibold" : "text-slate-500"}`}>Lost & found</button></div>

    {tab === "rooms" && <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[["Rooms", data?.rooms.length ?? 0], ["Pending", assignmentCounts.PENDING ?? 0], ["In progress", assignmentCounts.IN_PROGRESS ?? 0], ["Completed", assignmentCounts.COMPLETED ?? 0]].map(([label, count]) => <div key={label} className="msh-stat-card py-3"><div className="text-xl font-bold">{count}</div><div className="text-xs">{label}</div></div>)}</div>
      <section className="msh-card p-4">
        <h2 className="font-semibold mb-3">Assign rooms for a day</h2>
        <div className="grid sm:grid-cols-3 gap-2"><select className="msh-input" value={attendantId} onChange={(e) => setAttendantId(e.target.value)}><option value="">Select room attendant</option>{data?.attendants.map((attendant) => <option key={attendant.id} value={attendant.id}>{attendant.fullName}</option>)}</select><input className="msh-input" type="date" value={assignmentDate} onChange={(e) => setAssignmentDate(e.target.value)} /><button className="msh-btn msh-btn-primary" disabled={busy || !selectedRooms.length || !attendantId} onClick={() => void assignRooms()}>Assign {selectedRooms.length || "selected"} rooms</button></div>
        <p className="mt-2 text-xs text-slate-500">Select rooms in the grid. Assignments belong to the selected day; an assigned attendant is the only staff member who can start that room.</p>
      </section>
      <section className="msh-card p-4 space-y-3">
        <div><h2 className="font-semibold">Per-room supply standard</h2><p className="text-xs text-slate-500">Configure the items and quantities used per cleaned room. Generate a draft voucher after a shift; stock changes only after Inventory approves it.</p></div>
        <form onSubmit={saveSupplyStandard} className="grid sm:grid-cols-4 gap-2">
          <select required className="msh-input" value={supplyStandard.itemId} onChange={(e) => setSupplyStandard({ ...supplyStandard, itemId: e.target.value })}><option value="">Housekeeping supply</option>{supplyConfig?.items.map((item) => <option key={item.id} value={item.id}>{item.itemCode} · {item.name}</option>)}</select>
          <select required className="msh-input" value={supplyStandard.storeLocationId} onChange={(e) => setSupplyStandard({ ...supplyStandard, storeLocationId: e.target.value })}><option value="">Issue from store</option>{supplyConfig?.locations.map((location) => <option key={location.id} value={location.id}>{location.locationName}</option>)}</select>
          <input className="msh-input" required type="number" min="0.01" step="0.01" aria-label="Quantity per room" value={supplyStandard.quantityPerRoom} onChange={(e) => setSupplyStandard({ ...supplyStandard, quantityPerRoom: e.target.value })} />
          <button className="msh-btn" disabled={busy}>Save standard</button>
        </form>
        <ul className="divide-y text-sm">{supplyConfig?.standards.map((standard) => <li key={standard.id} className="flex justify-between gap-3 py-2"><span>{standard.item.name} · {standard.quantityPerRoom} {standard.item.baseUnitOfMeasure} per room · {standard.storeLocation.locationName}</span><button disabled={busy} onClick={() => void removeSupplyStandard(standard.id)} className="text-xs text-red-700">Remove</button></li>)}{!supplyConfig?.standards.length && <li className="py-2 text-xs text-slate-500">No supply standards configured.</li>}</ul>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="py-2 text-left">Daily issue vouchers</th><th className="py-2 text-left">Attendant / rooms</th><th className="py-2 text-left">Contents</th><th className="py-2 text-left">Status</th><th /></tr></thead><tbody>{supplyIssues.map((issue) => <tr key={issue.id} className="border-t align-top"><td className="py-2 pr-2">{issue.issueNumber}</td><td className="py-2 pr-2">{issue.attendant.fullName}<div className="text-xs text-slate-500">{issue.roomCount} rooms</div></td><td className="py-2 pr-2 text-xs">{issue.lines.map((line) => `${line.quantity} ${line.item.baseUnitOfMeasure} ${line.item.name} (${line.storeLocation.locationName})`).join(" · ")}</td><td className="py-2">{issue.status}{issue.approvedBy && <div className="text-xs text-slate-500">by {issue.approvedBy.fullName}</div>}</td><td className="py-2">{issue.status === "DRAFT" && <div className="flex gap-2">{issue.createdBy.id === user?.id && <button disabled={busy} className="text-xs border rounded px-2 py-1" onClick={() => void generateSupplyIssue(issue.attendant.id)}>Refresh draft</button>}{canApproveSupply && issue.createdBy.id !== user?.id && <button disabled={busy} className="text-xs border rounded px-2 py-1" onClick={() => void approveSupplyIssue(issue.id)}>Approve and issue stock</button>}</div>}</td></tr>)}{!supplyIssues.length && <tr><td colSpan={5} className="py-2 text-xs text-slate-500">No daily supply vouchers.</td></tr>}</tbody></table></div>
        {data?.assignments.some((assignment) => assignment.status === "COMPLETED") && <div className="flex flex-wrap gap-2">{[...new Map(data.assignments.filter((assignment) => assignment.status === "COMPLETED").map((assignment) => [assignment.attendantUserId, assignment.attendant])).entries()].map(([id, attendant]) => <button key={id} disabled={busy || supplyIssues.some((issue) => issue.attendant.id === id && issue.status !== "DRAFT")} className="msh-btn msh-btn-primary" onClick={() => void generateSupplyIssue(id)}>Generate draft for {attendant.fullName}</button>)}</div>}
      </section>
      <div className="flex flex-wrap gap-2">{filterOptions.map(([status, count]) => <button key={status} onClick={() => setFilter(status)} className={`px-3 py-1.5 rounded-full text-xs font-medium ${filter === status ? "bg-[hsl(var(--primary))] text-white" : "bg-white border text-slate-600"}`}>{status === "ALL" ? "All rooms" : status.replace(/_/g, " ")} ({count})</button>)}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">{filtered.map((room) => {
        const assignment = assignmentByRoom.get(room.id);
        const cleanLog = data?.openCleaningLogs.find((entry) => entry.roomId === room.id);
        const selected = selectedRooms.includes(room.id);
        return <article key={room.id} className={`bg-white border rounded-xl p-3 shadow-sm ${selected ? "ring-2 ring-[hsl(var(--primary))]" : ""}`}>
          <div className="flex items-center justify-between mb-2"><label className="flex items-center gap-2"><input type="checkbox" checked={selected} onChange={(event) => setSelectedRooms(event.target.checked ? [...selectedRooms, room.id] : selectedRooms.filter((id) => id !== room.id))} aria-label={`Select room ${room.number}`} /><span className="text-lg font-bold text-[hsl(var(--primary))]">{room.number}</span></label><span className="text-xs text-slate-400">F{room.floor}</span></div>
          <div className="text-xs text-slate-500 mb-2">{room.roomType.code}</div><span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${badges[room.status] ?? "bg-slate-100"}`}>{room.status.replace(/_/g, " ")}</span>
          {room.reservations[0] && <div className="text-[10px] text-slate-400 mt-1 truncate">Guest: {room.reservations[0].guest.lastName}</div>}
          {assignment && <div className="mt-2 rounded bg-slate-50 p-2 text-[10px]"><div>{assignment.attendant.fullName}</div><div className="text-slate-500">{assignment.status.replace(/_/g, " ")}</div></div>}
          {cleanLog && <div className="text-[10px] text-amber-700 mt-1">Cleaning since {new Date(cleanLog.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>}
          <div className="mt-2 space-y-1">{(actions[room.status] ?? []).map((action) => <button key={action.status} disabled={busy} onClick={() => void changeStatus(room, action.status)} className="w-full text-[10px] bg-[hsl(var(--primary))] text-white py-1 rounded disabled:opacity-50">{action.label}</button>)}{!["OCCUPIED", "OUT_OF_ORDER", "OUT_OF_SERVICE", "MAINTENANCE"].includes(room.status) && <button disabled={busy} onClick={() => void reportDefect(room)} className="w-full text-[10px] border py-1 rounded">Report defect</button>}</div>
        </article>;
      })}</div>
    </>}

    {tab === "lost" && <>
      <form onSubmit={createLostItem} className="msh-card p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <h2 className="sm:col-span-2 lg:col-span-4 font-semibold">Record a found item</h2><input className="msh-input" required placeholder="Item description" value={lostForm.itemDescription} onChange={(e) => setLostForm({ ...lostForm, itemDescription: e.target.value })} /><input className="msh-input" required placeholder="Location found (room / area)" value={lostForm.locationFound} onChange={(e) => setLostForm({ ...lostForm, locationFound: e.target.value })} /><input className="msh-input" placeholder="Storage location" value={lostForm.storageLocation} onChange={(e) => setLostForm({ ...lostForm, storageLocation: e.target.value })} /><input className="msh-input" placeholder="Notes" value={lostForm.notes} onChange={(e) => setLostForm({ ...lostForm, notes: e.target.value })} /><button disabled={busy} className="msh-btn msh-btn-primary sm:col-span-2 lg:col-span-4">Save lost-and-found record</button>
      </form>
      <section className="msh-card overflow-hidden"><div className="flex flex-wrap gap-2 p-3"><input className="msh-input max-w-sm" placeholder="Search description, location, claimant" value={lostSearch} onChange={(e) => setLostSearch(e.target.value)} /><select className="msh-input max-w-48" value={lostStatusFilter} onChange={(e) => setLostStatusFilter(e.target.value)}><option value="ALL">All dispositions</option><option value="UNCLAIMED">Unclaimed</option><option value="CLAIMED">Claimed</option><option value="DONATED">Donated</option><option value="DISPOSED">Disposed</option></select></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-[hsl(var(--muted))] text-left"><tr><th className="p-3">Item</th><th className="p-3">Found at</th><th className="p-3">Date / by</th><th className="p-3">Storage</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody>{lostItems.map((item) => <tr key={item.id} className="border-t"><td className="p-3">{item.itemDescription}</td><td className="p-3">{item.locationFound}</td><td className="p-3">{item.dateFound.slice(0, 10)}<div className="text-xs text-slate-500">{item.foundBy.fullName}</div></td><td className="p-3">{item.storageLocation || "—"}</td><td className="p-3">{item.status}{item.claimedBy && <div className="text-xs text-slate-500">{item.claimedBy}</div>}</td><td className="p-3">{item.status === "UNCLAIMED" && <div className="flex flex-wrap gap-2"><button disabled={busy} className="text-xs border rounded px-2 py-1" onClick={() => void disposeLostItem(item, "CLAIMED")}>Mark claimed</button><button disabled={busy} className="text-xs border rounded px-2 py-1" onClick={() => void disposeLostItem(item, "DONATED")}>Donate</button><button disabled={busy} className="text-xs border rounded px-2 py-1" onClick={() => void disposeLostItem(item, "DISPOSED")}>Dispose</button></div>}</td></tr>)}{!lostItems.length && <tr><td colSpan={6} className="p-3 text-slate-500">No matching lost-and-found records.</td></tr>}</tbody></table></div></section>
    </>}
  </div>;
}
