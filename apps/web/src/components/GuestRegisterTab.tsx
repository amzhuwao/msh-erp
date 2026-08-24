"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

export function GuestRegisterTab() {
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", nationality: "Zimbabwe",
    nationalId: "", passportNumber: "",
  });
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      const guest = await apiFetch<{ firstName: string; lastName: string }>("/api/guests", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setMessage(`Registered ${guest.firstName} ${guest.lastName}`);
      setForm({ firstName: "", lastName: "", email: "", phone: "", nationality: "Zimbabwe", nationalId: "", passportNumber: "" });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Registration failed");
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-[hsl(var(--primary))] mb-4">Guest registration</h2>
      <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">Nationality and National ID or passport are compulsory.</p>
      <form onSubmit={submit} className="grid md:grid-cols-2 gap-3 max-w-3xl">
        <input className="msh-input" required placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        <input className="msh-input" required placeholder="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        <input className="msh-input" required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="msh-input" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className="msh-input" required placeholder="Nationality" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
        <input className="msh-input" placeholder="National ID" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} />
        <input className="msh-input" placeholder="Passport number" value={form.passportNumber} onChange={(e) => setForm({ ...form, passportNumber: e.target.value })} />
        <button className="msh-btn msh-btn-primary">Register guest</button>
      </form>
      {message && <p className="mt-3 text-sm">{message}</p>}
    </div>
  );
}
