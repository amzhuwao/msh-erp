"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

export function GuestRegisterTab() {
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", nationality: "Zimbabwe",
    nationalId: "", passportNumber: "", nextOfKin: "", nextOfKinPhone: "",
  });
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      const guest = await apiFetch<{ firstName: string; lastName: string }>("/api/guests", {
        method: "POST",
        body: JSON.stringify({ ...form, email: form.email.trim() || null }),
      });
      setMessage(`Registered ${guest.firstName} ${guest.lastName}`);
      setForm({ firstName: "", lastName: "", email: "", phone: "", nationality: "Zimbabwe", nationalId: "", passportNumber: "", nextOfKin: "", nextOfKinPhone: "" });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Registration failed");
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-[hsl(var(--primary))] mb-4">Guest registration</h2>
      <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">Nationality and National ID or passport are compulsory.</p>
      <form onSubmit={submit} className="grid md:grid-cols-2 gap-3 max-w-3xl">
        <label className="text-sm">First name *<input className="msh-input mt-1" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
        <label className="text-sm">Last name *<input className="msh-input mt-1" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
        <label className="text-sm">Email (optional)<input className="msh-input mt-1" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className="text-sm">Phone<input className="msh-input mt-1" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label className="text-sm">Nationality *<input className="msh-input mt-1" required value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} /></label>
        <label className="text-sm">National ID<input className="msh-input mt-1" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} /></label>
        <label className="text-sm">Passport number<input className="msh-input mt-1" value={form.passportNumber} onChange={(e) => setForm({ ...form, passportNumber: e.target.value })} /></label>
        <label className="text-sm">Next of kin<input className="msh-input mt-1" value={form.nextOfKin} onChange={(e) => setForm({ ...form, nextOfKin: e.target.value })} /></label>
        <label className="text-sm">Next-of-kin contact number<input className="msh-input mt-1" type="tel" value={form.nextOfKinPhone} onChange={(e) => setForm({ ...form, nextOfKinPhone: e.target.value })} /></label>
        <button className="msh-btn msh-btn-primary">Register guest</button>
      </form>
      {message && <p className="mt-3 text-sm">{message}</p>}
    </div>
  );
}
