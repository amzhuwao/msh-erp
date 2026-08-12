"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

interface Company {
  id: string;
  companyName: string;
}

export default function NewGroupPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [availability, setAvailability] = useState<{ sufficient: boolean; totalAvailable: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    groupName: "",
    companyId: "",
    contactPerson: "",
    phone: "",
    email: "",
    arrivalDate: "",
    departureDate: "",
    adults: 10,
    children: 0,
    roomCount: 5,
    specialRequests: "",
    depositAmount: 0,
  });

  useEffect(() => {
    apiFetch<{ items: Company[] }>("/api/corporate/profiles").then((d) => setCompanies(d.items));
  }, []);

  async function checkAvailability() {
    if (!form.arrivalDate || !form.departureDate) return;
    const data = await apiFetch<{ sufficient: boolean; totalAvailable: number }>(
      `/api/group-reservations/availability?arrivalDate=${form.arrivalDate}&departureDate=${form.departureDate}&roomCount=${form.roomCount}`,
    );
    setAvailability(data);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const group = await apiFetch<{ id: string }>("/api/group-reservations", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          companyId: form.companyId || undefined,
        }),
      });
      router.push(`/dashboard/groups/${group.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <Link href="/dashboard/groups" className="text-sm text-slate-400 hover:text-slate-600">← Back to groups</Link>
      <h1 className="text-2xl font-semibold text-[#0f2744] mt-4 mb-6">New Group Reservation</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <Field label="Group Name" value={form.groupName} onChange={(v) => setForm({ ...form, groupName: v })} required />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Company (optional)</label>
          <select
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={form.companyId}
            onChange={(e) => setForm({ ...form, companyId: e.target.value })}
          >
            <option value="">— Walk-in / No company —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.companyName}</option>
            ))}
          </select>
        </div>
        <Field label="Contact Person" value={form.contactPerson} onChange={(v) => setForm({ ...form, contactPerson: v })} required />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} required />
          <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Arrival Date" type="date" value={form.arrivalDate} onChange={(v) => setForm({ ...form, arrivalDate: v })} required />
          <Field label="Departure Date" type="date" value={form.departureDate} onChange={(v) => setForm({ ...form, departureDate: v })} required />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Adults" type="number" value={String(form.adults)} onChange={(v) => setForm({ ...form, adults: Number(v) })} required />
          <Field label="Children" type="number" value={String(form.children)} onChange={(v) => setForm({ ...form, children: Number(v) })} />
          <Field label="Rooms Required" type="number" value={String(form.roomCount)} onChange={(v) => setForm({ ...form, roomCount: Number(v) })} required />
        </div>
        <button type="button" onClick={checkAvailability} className="text-sm text-[#4a90a4] hover:underline">
          Check availability
        </button>
        {availability && (
          <div className={`text-sm px-3 py-2 rounded-lg ${availability.sufficient ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {availability.sufficient
              ? `${availability.totalAvailable} rooms available — sufficient for ${form.roomCount} rooms`
              : `Only ${availability.totalAvailable} rooms available — need ${form.roomCount}`}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Special Requests</label>
          <textarea
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            rows={3}
            value={form.specialRequests}
            onChange={(e) => setForm({ ...form, specialRequests: e.target.value })}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="bg-[#0f2744] text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60">
            {loading ? "Creating…" : "Save Draft"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", required,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        type={type}
        required={required}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
