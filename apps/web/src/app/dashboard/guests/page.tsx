"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

type GuestInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nationality: string;
  nationalId: string;
  passportNumber: string;
  gender: string;
  companyName: string;
  address: string;
  carRegistration: string;
  nextOfKin: string;
  nextOfKinPhone: string;
  notes: string;
};
type Guest = Omit<GuestInput, "email"> & { email: string | null } & {
  id: string;
  createdAt: string;
  updatedAt: string;
  _count?: { reservations: number };
  reservations?: {
    id: string;
    reservationNumber: string;
    status: string;
    checkInDate: string;
    checkOutDate: string;
    room: { number: string } | null;
  }[];
};
type ImportResult = {
  created: number;
  failed: number;
  results: { row: number; status: "created" | "error"; message?: string }[];
};

const emptyGuest: GuestInput = {
  firstName: "", lastName: "", email: "", phone: "", nationality: "",
  nationalId: "", passportNumber: "", gender: "", companyName: "", address: "",
  carRegistration: "", nextOfKin: "", nextOfKinPhone: "", notes: "",
};
const csvColumns = [
  "firstName", "lastName", "email", "phone", "nationality", "nationalId", "passportNumber",
  "gender", "companyName", "address", "carRegistration", "nextOfKin", "nextOfKinPhone", "notes",
] as const;
const csvAliases: Record<string, keyof GuestInput> = Object.fromEntries(
  csvColumns.map((column) => [column.toLowerCase(), column]),
) as Record<string, keyof GuestInput>;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ",") { row.push(field.trim()); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = []; field = "";
    } else field += char;
  }
  row.push(field.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  if (quoted) throw new Error("The CSV has an unclosed quoted field.");
  return rows;
}

function csvGuestRows(text: string): GuestInput[] {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("Add a header row and at least one guest profile.");
  const headers = rows[0]!.map((header) => csvAliases[header.toLowerCase().replace(/[\s_-]/g, "")] ?? null);
  for (const required of ["firstName", "lastName", "nationality"] as const) {
    if (!headers.includes(required)) throw new Error(`CSV is missing the required “${required}” column.`);
  }
  if (!headers.includes("nationalId") && !headers.includes("passportNumber")) {
    throw new Error("Include a “nationalId” or “passportNumber” column (each guest needs one of these).");
  }
  if (rows.length - 1 > 500) throw new Error("A single import can contain up to 500 profiles.");
  return rows.slice(1).map((cells, rowIndex) => {
    const guest = { ...emptyGuest };
    headers.forEach((column, index) => {
      if (!column) return;
      const value = cells[index] ?? "";
      guest[column] = value;
    });
    return guest;
  });
}

function downloadCsvTemplate() {
  const sampleValues: Record<string, string> = { nationality: "Zimbabwe", nationalId: "NationalID123" };
  const sample = csvColumns.map((column) => sampleValues[column] ?? "");
  const csv = `${csvColumns.join(",")}\r\n${sample.join(",")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = "guest-profiles-template.csv"; link.click();
  URL.revokeObjectURL(url);
}

function displayDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function ProfileField({
  label, value, onChange, required = false, type = "text",
}: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string;
}) {
  return <label className="block text-sm">{label}{required && " *"}<input className="msh-input mt-1" type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export default function GuestsPage() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [editing, setEditing] = useState<Guest | "new" | null>(null);
  const [form, setForm] = useState<GuestInput>(emptyGuest);
  const [saving, setSaving] = useState(false);
  const [csvDraft, setCsvDraft] = useState<GuestInput[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvError, setCsvError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ items: Guest[]; total: number }>(
        `/api/guests?search=${encodeURIComponent(search)}&page=${page}&limit=20`,
      );
      setGuests(result.items); setTotal(result.total); setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load guest profiles");
    } finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { void load(); }, [load]);

  function startNew() {
    setSelectedGuest(null); setEditing("new"); setForm({ ...emptyGuest });
    setMessage(""); setError("");
  }

  async function viewGuest(id: string) {
    try {
      const guest = await apiFetch<Guest>(`/api/guests/${id}`);
      setSelectedGuest(guest); setEditing(null); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load profile"); }
  }

  function editGuest(guest: Guest) {
    setSelectedGuest(null); setEditing(guest);
    const values = { ...emptyGuest } as GuestInput;
    for (const column of csvColumns) {
      values[column] = guest[column] ?? "";
    }
    setForm(values); setError(""); setMessage("");
  }

  async function saveGuest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    const payload = {
      ...form,
      phone: form.phone || null,
      nationalId: form.nationalId || null,
      passportNumber: form.passportNumber || null,
      gender: form.gender || null,
      companyName: form.companyName || null,
      address: form.address || null,
      carRegistration: form.carRegistration || null,
      email: form.email?.trim() || null,
      nextOfKin: form.nextOfKin || null,
      nextOfKinPhone: form.nextOfKinPhone || null,
      notes: form.notes || null,
    };
    try {
      const saved = await apiFetch<Guest>(editing === "new" ? "/api/guests" : `/api/guests/${editing!.id}`, {
        method: editing === "new" ? "POST" : "PUT", body: JSON.stringify(payload),
      });
      setMessage(editing === "new" ? "Guest profile created." : "Guest profile updated.");
      setEditing(null); setSelectedGuest(saved); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save guest profile"); }
    finally { setSaving(false); }
  }

  async function stageCsv(file?: File) {
    setCsvDraft([]); setImportResult(null); setCsvError(""); setMessage("");
    if (!file) return;
    setCsvFileName(file.name);
    try { setCsvDraft(csvGuestRows(await file.text())); }
    catch (err) { setCsvError(err instanceof Error ? err.message : "Could not read this CSV file"); }
  }

  async function importCsv() {
    setImporting(true); setCsvError(""); setImportResult(null);
    try {
      const result = await apiFetch<ImportResult>("/api/guests/bulk", {
        method: "POST",
        body: JSON.stringify({ guests: csvDraft.map((guest) => ({
          ...guest,
          phone: guest.phone || null,
          nationalId: guest.nationalId || null,
          passportNumber: guest.passportNumber || null,
          gender: guest.gender || null,
          companyName: guest.companyName || null,
          address: guest.address || null,
          carRegistration: guest.carRegistration || null,
          email: guest.email?.trim() || null,
          nextOfKin: guest.nextOfKin || null,
          nextOfKinPhone: guest.nextOfKinPhone || null,
          notes: guest.notes || null,
        })) }),
      });
      setImportResult(result);
      setMessage(`Import finished: ${result.created} created, ${result.failed} need attention.`);
      if (result.created > 0) await load();
    } catch (err) { setCsvError(err instanceof Error ? err.message : "Guest import failed"); }
    finally { setImporting(false); }
  }

  function setField<K extends keyof GuestInput>(key: K, value: GuestInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const pageCount = Math.max(1, Math.ceil(total / 20));

  return <div className="p-6 space-y-5">
    <PageHeader title="Guest Profiles" description="View and maintain registered guest details, or import multiple profiles from a CSV file." />

    {(error || message) && <div role={error ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${error ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>{error || message}</div>}

    <section className="msh-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold">Bulk guest profile creation</h2><p className="text-sm text-[hsl(var(--muted-foreground))]">CSV columns: firstName, lastName, nationality, and a nationalId or passportNumber. Email and other profile fields are optional.</p></div>
        <button type="button" className="msh-btn msh-btn-outline" onClick={downloadCsvTemplate}>Download CSV template</button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input aria-label="Choose guest profiles CSV" type="file" accept=".csv,text/csv" onChange={(event) => void stageCsv(event.target.files?.[0])} />
        {csvFileName && <span className="text-sm text-slate-600">{csvFileName}</span>}
      </div>
      {csvError && <p role="alert" className="text-sm text-red-700">{csvError}</p>}
      {csvDraft.length > 0 && <div className="rounded-lg border p-3 space-y-2">
        <p className="text-sm">Ready to import <strong>{csvDraft.length}</strong> guest profile{csvDraft.length === 1 ? "" : "s"}. Check the first few rows, then confirm.</p>
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left"><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Nationality</th><th className="p-2">ID / passport</th></tr></thead><tbody>
          {csvDraft.slice(0, 4).map((guest, index) => <tr className="border-t" key={`${guest.email}-${index}`}><td className="p-2">{guest.firstName} {guest.lastName}</td><td className="p-2">{guest.email || "—"}</td><td className="p-2">{guest.nationality || "—"}</td><td className="p-2">{guest.nationalId || guest.passportNumber || "—"}</td></tr>)}
        </tbody></table></div>
        <button type="button" className="msh-btn msh-btn-primary" disabled={importing} onClick={() => void importCsv()}>{importing ? "Importing…" : `Import ${csvDraft.length} profiles`}</button>
      </div>}
      {importResult && importResult.failed > 0 && <div className="max-h-40 overflow-auto text-sm text-red-800"><h3 className="font-semibold">Rows that need attention</h3><ul className="list-disc pl-5">{importResult.results.filter((result) => result.status === "error").map((result) => <li key={result.row}>CSV row {result.row}: {result.message}</li>)}</ul></div>}
    </section>

    {selectedGuest && <section className="msh-card p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{selectedGuest.firstName} {selectedGuest.lastName}</h2><p className="text-sm text-slate-500">Registered {displayDate(selectedGuest.createdAt)} · {selectedGuest._count?.reservations ?? 0} reservation(s)</p></div><div className="flex gap-2"><button className="msh-btn msh-btn-primary" type="button" onClick={() => editGuest(selectedGuest)}>Edit profile</button><button className="msh-btn msh-btn-outline" type="button" onClick={() => setSelectedGuest(null)}>Close</button></div></div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">{([
        ["Email", selectedGuest.email], ["Phone", selectedGuest.phone], ["Nationality", selectedGuest.nationality],
        ["National ID", selectedGuest.nationalId], ["Passport", selectedGuest.passportNumber], ["Gender", selectedGuest.gender],
        ["Company", selectedGuest.companyName], ["Address", selectedGuest.address], ["Vehicle registration", selectedGuest.carRegistration],
        ["Next of kin", selectedGuest.nextOfKin], ["Next-of-kin contact number", selectedGuest.nextOfKinPhone], ["Notes", selectedGuest.notes],
      ] as [string, string | null][]).map(([label, value]) => <div key={label}><dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1">{value || "—"}</dd></div>)}</dl>
      <div><h3 className="font-semibold text-sm mb-2">Recent reservations</h3>{selectedGuest.reservations?.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th className="p-2">Reservation</th><th className="p-2">Dates</th><th className="p-2">Room</th><th className="p-2">Status</th></tr></thead><tbody>{selectedGuest.reservations.map((reservation) => <tr key={reservation.id} className="border-t"><td className="p-2">{reservation.reservationNumber}</td><td className="p-2">{displayDate(reservation.checkInDate)} – {displayDate(reservation.checkOutDate)}</td><td className="p-2">{reservation.room?.number ?? "—"}</td><td className="p-2">{reservation.status}</td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">No reservations found.</p>}</div>
    </section>}

    {editing && <section className="msh-card p-4 space-y-4">
      <h2 className="font-semibold">{editing === "new" ? "Create guest profile" : `Edit ${editing.firstName} ${editing.lastName}`}</h2>
      <form onSubmit={(event) => void saveGuest(event)} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ProfileField label="First name" required value={form.firstName} onChange={(value) => setField("firstName", value)} />
          <ProfileField label="Last name" required value={form.lastName} onChange={(value) => setField("lastName", value)} />
          <ProfileField label="Email (optional)" type="email" value={form.email} onChange={(value) => setField("email", value)} />
          <ProfileField label="Phone" value={form.phone} onChange={(value) => setField("phone", value)} />
          <ProfileField label="Nationality" required value={form.nationality} onChange={(value) => setField("nationality", value)} />
          <ProfileField label="National ID" value={form.nationalId} onChange={(value) => setField("nationalId", value)} />
          <ProfileField label="Passport number" value={form.passportNumber} onChange={(value) => setField("passportNumber", value)} />
          <ProfileField label="Gender" value={form.gender} onChange={(value) => setField("gender", value)} />
          <ProfileField label="Company" value={form.companyName} onChange={(value) => setField("companyName", value)} />
          <ProfileField label="Vehicle registration" value={form.carRegistration} onChange={(value) => setField("carRegistration", value)} />
          <ProfileField label="Next of kin" value={form.nextOfKin} onChange={(value) => setField("nextOfKin", value)} />
          <ProfileField label="Next-of-kin contact number" type="tel" value={form.nextOfKinPhone} onChange={(value) => setField("nextOfKinPhone", value)} />
          <label className="block text-sm sm:col-span-2">Address<textarea className="msh-input mt-1 min-h-20" value={form.address} onChange={(event) => setField("address", event.target.value)} /></label>
          <label className="block text-sm sm:col-span-2">Notes<textarea className="msh-input mt-1 min-h-20" value={form.notes} onChange={(event) => setField("notes", event.target.value)} /></label>
        </div>
        {!form.nationalId.trim() && !form.passportNumber.trim() && <p className="text-xs text-amber-700">Enter either a national ID or passport number to save the profile.</p>}
        <div className="flex gap-2"><button className="msh-btn msh-btn-primary" type="submit" disabled={saving || (!form.nationalId.trim() && !form.passportNumber.trim())}>{saving ? "Saving…" : "Save profile"}</button><button className="msh-btn msh-btn-outline" type="button" onClick={() => setEditing(null)}>Cancel</button></div>
      </form>
    </section>}

    <section className="msh-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Registered guests</h2><p className="text-sm text-slate-500">{total} profile{total === 1 ? "" : "s"}</p></div><div className="flex gap-2"><form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}><input className="msh-input min-w-52" aria-label="Search guest profiles" placeholder="Search guests…" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /><button className="msh-btn msh-btn-outline" type="submit">Search</button></form><button className="msh-btn msh-btn-primary" type="button" onClick={startNew}>Add guest</button></div></div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-[hsl(var(--muted))] text-left"><tr><th className="p-3">Guest</th><th className="p-3">Email / phone</th><th className="p-3">Nationality</th><th className="p-3">Reservations</th><th className="p-3" /></tr></thead><tbody>
        {loading ? <tr><td colSpan={5} className="p-5 text-center text-slate-500">Loading guest profiles…</td></tr> : guests.map((guest) => <tr key={guest.id} className="border-t"><td className="p-3 font-medium">{guest.firstName} {guest.lastName}</td><td className="p-3">{guest.email || "—"}<div className="text-xs text-slate-500">{guest.phone ?? "—"}</div></td><td className="p-3">{guest.nationality ?? "—"}</td><td className="p-3">{guest._count?.reservations ?? 0}</td><td className="p-3 text-right whitespace-nowrap"><button className="msh-btn msh-btn-outline text-xs" type="button" onClick={() => void viewGuest(guest.id)}>View</button><button className="msh-btn msh-btn-outline text-xs ml-2" type="button" onClick={() => editGuest(guest)}>Edit</button></td></tr>)}
        {!loading && guests.length === 0 && <tr><td colSpan={5} className="p-5 text-center text-slate-500">No guest profiles found.</td></tr>}
      </tbody></table></div>
      <div className="flex items-center justify-between border-t p-3 text-sm"><span>Page {page} of {pageCount}</span><div className="flex gap-2"><button className="msh-btn msh-btn-outline text-xs" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="msh-btn msh-btn-outline text-xs" type="button" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
    </section>
  </div>;
}
