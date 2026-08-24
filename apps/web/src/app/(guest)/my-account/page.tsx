"use client";

import { useEffect, useState } from "react";
import { GuestGate } from "@/components/portal/GuestGate";
import { IconUser } from "@/components/portal/Icons";
import { guestApiFetch, setGuestSession, getGuestToken, type GuestProfile } from "@/lib/guest-api";

function AccountBody() {
  const [guest, setGuest] = useState<GuestProfile | null>(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<Partial<GuestProfile>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    guestApiFetch<{ guest: GuestProfile }>("/api/guest/me").then((d) => {
      setGuest(d.guest);
      setForm(d.guest);
    });
  }, []);

  function set(field: keyof GuestProfile, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const data = await guestApiFetch<{ guest: GuestProfile }>("/api/guest/me", {
        method: "PATCH",
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          nationality: form.nationality,
          gender: form.gender,
          companyName: form.companyName,
          address: form.address,
          carRegistration: form.carRegistration,
          nextOfKin: form.nextOfKin,
          idPassport: form.idPassport,
        }),
      });
      setGuest(data.guest);
      setForm(data.guest);
      const token = getGuestToken();
      if (token) setGuestSession(token, data.guest);
      setEdit(false);
      setMessage("Profile saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      await guestApiFetch("/api/guest/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password updated successfully");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Password update failed");
    }
  }

  if (!guest) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-display font-bold mb-1">My Account</h1>
      <p className="text-sm text-muted-foreground mb-6">Manage your personal information and security settings.</p>
      {message && <p className="mb-4 text-sm text-primary">{message}</p>}
      <div className="space-y-6">
        <section className="rounded-lg border bg-card shadow-sm">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <IconUser className="h-5 w-5 text-primary" /> Personal Information
              </h2>
              {!edit ? (
                <button type="button" className="msh-btn msh-btn-outline text-sm" onClick={() => { setForm(guest); setEdit(true); }}>Edit</button>
              ) : (
                <div className="flex gap-2">
                  <button type="button" className="msh-btn msh-btn-ghost text-sm" onClick={() => setEdit(false)}>Cancel</button>
                  <button type="button" className="msh-btn msh-btn-primary text-sm" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save"}</button>
                </div>
              )}
            </div>
            {edit ? (
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First Name *" value={form.firstName || ""} onChange={(v) => set("firstName", v)} />
                  <Field label="Last Name *" value={form.lastName || ""} onChange={(v) => set("lastName", v)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Email" value={guest.email} disabled />
                  <Field label="Phone" value={form.phone || ""} onChange={(v) => set("phone", v)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Gender</label>
                    <select className="msh-input" value={form.gender || ""} onChange={(e) => set("gender", e.target.value)}>
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <Field label="Country" value={form.nationality || ""} onChange={(v) => set("nationality", v)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="ID / Passport" value={form.idPassport || ""} onChange={(v) => set("idPassport", v)} />
                  <Field label="Company" value={form.companyName || ""} onChange={(v) => set("companyName", v)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Car Registration" value={form.carRegistration || ""} onChange={(v) => set("carRegistration", v)} />
                  <Field label="Next of Kin" value={form.nextOfKin || ""} onChange={(v) => set("nextOfKin", v)} />
                </div>
                <Field label="Address" value={form.address || ""} onChange={(v) => set("address", v)} />
              </div>
            ) : (
              <dl className="grid sm:grid-cols-2 gap-3 text-sm">
                <Item label="Name" value={`${guest.firstName} ${guest.lastName}`} />
                <Item label="Email" value={guest.email} />
                <Item label="Phone" value={guest.phone || "—"} />
                <Item label="Country" value={guest.nationality || "—"} />
                <Item label="ID / Passport" value={guest.idPassport || "—"} />
                <Item label="Company" value={guest.companyName || "—"} />
              </dl>
            )}
          </div>
        </section>

        <section className="rounded-lg border bg-card shadow-sm">
          <form className="p-5 space-y-3" onSubmit={changePassword}>
            <h2 className="text-lg font-semibold mb-2">Change password</h2>
            <Field label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} />
            <Field label="New password" type="password" value={newPassword} onChange={setNewPassword} />
            <button type="submit" className="msh-btn msh-btn-primary">Update password</button>
          </form>
        </section>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", disabled }: { label: string; value: string; onChange?: (v: string) => void; type?: string; disabled?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <input className={`msh-input ${disabled ? "bg-muted" : ""}`} type={type} value={value} disabled={disabled} onChange={(e) => onChange?.(e.target.value)} />
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

export default function AccountPage() {
  return (
    <GuestGate next="/my-account">
      <AccountBody />
    </GuestGate>
  );
}
