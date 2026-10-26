"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Property {
  address: string;
  vatNumber: string | null;
  tinNumber: string | null;
  bpNumber: string | null;
  vatRatePercent: string;
  ztaLevyRatePercent: string;
  contactPhone: string | null;
  netoneNumber: string | null;
  whatsappNumber: string | null;
  receptionEmail: string | null;
  bankName: string | null;
  bankBranch: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankSwiftCode: string | null;
  ecocashNumber: string | null;
  ecocashMerchant: string | null;
  onemoneyNumber: string | null;
}

export default function SettingsPage() {
  const [form, setForm] = useState<Property | null>(null);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    apiFetch<Property>("/api/property").then((property) => setForm({
      ...property,
      vatRatePercent: String(Number(property.vatRatePercent ?? 15)),
      ztaLevyRatePercent: String(Number(property.ztaLevyRatePercent ?? 2)),
    }));
  }, []);

  async function save() {
    if (!form) return;
    await apiFetch("/api/property", {
      method: "PUT",
      body: JSON.stringify({
        ...form,
        vatRatePercent: Number(form.vatRatePercent),
        ztaLevyRatePercent: Number(form.ztaLevyRatePercent),
      }),
    });
    setSaved("Saved — new charges, reports and invoices will use these tax rates.");
  }

  if (!form) return <div className="p-6">Loading…</div>;

  function field(key: keyof Property, label: string) {
    return (
      <label className="text-sm block">
        {label}
        <input className="msh-input mt-1" value={form![key] ?? ""} onChange={(e) => setForm({ ...form!, [key]: e.target.value })} />
      </label>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader title="Property details" description="Property contact details, payment instructions and tax rates used for new charges and invoices" />
      <div className="msh-card p-4 grid md:grid-cols-2 gap-3">
        {field("address", "Address")}
        {field("vatNumber", "VAT number")}
        {field("tinNumber", "TIN number")}
        {field("bpNumber", "ZIMRA BP number")}
        <label className="text-sm block">VAT rate (%)<input className="msh-input mt-1" type="number" min="0" max="100" step="0.01" value={form.vatRatePercent} onChange={(e) => setForm({ ...form, vatRatePercent: e.target.value })} /></label>
        <label className="text-sm block">ZTA levy (%)<input className="msh-input mt-1" type="number" min="0" max="100" step="0.01" value={form.ztaLevyRatePercent} onChange={(e) => setForm({ ...form, ztaLevyRatePercent: e.target.value })} /></label>
        {field("contactPhone", "Landline")}
        {field("netoneNumber", "NetOne number")}
        {field("whatsappNumber", "WhatsApp")}
        {field("receptionEmail", "Reception email (online bookings)")}
        {field("bankName", "Bank")}
        {field("bankBranch", "Branch")}
        {field("bankAccountName", "Account name")}
        {field("bankAccountNumber", "Account number")}
        {field("bankSwiftCode", "SWIFT")}
        {field("ecocashNumber", "EcoCash number")}
        {field("ecocashMerchant", "EcoCash merchant")}
        {field("onemoneyNumber", "OneMoney / NetOne pay")}
      </div>
      <button className="msh-btn msh-btn-primary mt-4" onClick={save}>Save</button>
      {saved && <p className="text-sm text-emerald-700 mt-2">{saved}</p>}
    </div>
  );
}
