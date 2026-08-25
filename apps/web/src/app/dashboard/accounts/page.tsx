"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, getStoredUser } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

type Tab = "users" | "roles" | "guests";

interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, string[]>;
  _count?: { users: number };
}

interface Department {
  id: string;
  name: string;
}

interface Override {
  id?: string;
  module: string;
  action: string;
  isAllowed: boolean;
}

interface StaffUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  isActive: boolean;
  sessionTimeoutMinutes: number;
  lastLoginAt: string | null;
  roleId: string;
  departmentId: string | null;
  role: { id: string; name: string; permissions: Record<string, string[]> };
  department: { id: string; name: string } | null;
  permissionOverrides: Override[];
}

interface GuestAccount {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  nationality: string | null;
  nationalId: string | null;
  passportNumber: string | null;
  vipStatus: string;
  notes: string | null;
  hasPortalAccount: boolean;
  createdAt: string;
  _count?: { reservations: number };
}

const VIP = ["NONE", "VIP1", "VIP2", "VIP3"];

function Field({
  label, value, onChange, type = "text", min, required,
}: {
  label: string; value: string | number; onChange: (v: string) => void; type?: string; min?: number; required?: boolean;
}) {
  return (
    <label className="text-sm block">
      {label}
      <input
        className="msh-input mt-1"
        type={type}
        min={min}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function permSummary(permissions: Record<string, string[]>) {
  const modules = Object.keys(permissions).filter((m) => (permissions[m] ?? []).length > 0);
  if (!modules.length) return "No modules";
  return `${modules.length} module${modules.length === 1 ? "" : "s"}`;
}

export default function AccountsPage() {
  const me = getStoredUser();
  const [tab, setTab] = useState<Tab>("users");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const [users, setUsers] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [guests, setGuests] = useState<GuestAccount[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);

  const [editingUser, setEditingUser] = useState<StaffUser | null | "new">(null);
  const [userForm, setUserForm] = useState<Record<string, string>>({});
  const [passwordForm, setPasswordForm] = useState("");
  const [overrides, setOverrides] = useState<Override[]>([]);

  const [editingRole, setEditingRole] = useState<Role | null | "new">(null);
  const [roleForm, setRoleForm] = useState({ name: "", description: "" });
  const [rolePerms, setRolePerms] = useState<Record<string, string[]>>({});

  const [editingGuest, setEditingGuest] = useState<GuestAccount | null | "new">(null);
  const [guestForm, setGuestForm] = useState<Record<string, string>>({});
  const [guestPassword, setGuestPassword] = useState("");

  const load = useCallback(async () => {
    const [u, r, d, g, catalog] = await Promise.all([
      apiFetch<{ items: StaffUser[] }>(`/api/accounts/users${search ? `?search=${encodeURIComponent(search)}` : ""}`),
      apiFetch<{ items: Role[] }>("/api/accounts/roles"),
      apiFetch<{ items: Department[] }>("/api/accounts/departments"),
      apiFetch<{ items: GuestAccount[] }>(`/api/accounts/guests${search ? `?search=${encodeURIComponent(search)}` : ""}`),
      apiFetch<{ modules: string[]; actions: string[] }>("/api/accounts/access-catalog"),
    ]);
    setUsers(u.items);
    setRoles(r.items);
    setDepartments(d.items);
    setGuests(g.items);
    setModules(catalog.modules);
    setActions(catalog.actions);
  }, [search]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load accounts"));
  }, [load]);

  function flash(msg: string) {
    setMessage(msg);
    setError("");
  }

  function fail(err: unknown) {
    setError(err instanceof Error ? err.message : "Request failed");
    setMessage("");
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  function openNewUser() {
    setEditingUser("new");
    setUserForm({
      username: "",
      email: "",
      password: "",
      fullName: "",
      roleId: roles.find((r) => r.name === "Receptionist")?.id ?? roles[0]?.id ?? "",
      departmentId: departments[0]?.id ?? "",
      isActive: "true",
      sessionTimeoutMinutes: "20",
    });
    setOverrides([]);
    setPasswordForm("");
  }

  function openEditUser(u: StaffUser) {
    setEditingUser(u);
    setUserForm({
      email: u.email,
      fullName: u.fullName,
      roleId: u.roleId,
      departmentId: u.departmentId ?? "",
      isActive: String(u.isActive),
      sessionTimeoutMinutes: String(u.sessionTimeoutMinutes),
    });
    setOverrides(u.permissionOverrides.map((o) => ({
      module: o.module,
      action: o.action,
      isAllowed: o.isAllowed,
    })));
    setPasswordForm("");
  }

  async function saveUser() {
    try {
      if (editingUser === "new") {
        await apiFetch("/api/accounts/users", {
          method: "POST",
          body: JSON.stringify({
            username: userForm.username,
            email: userForm.email,
            password: userForm.password,
            fullName: userForm.fullName,
            roleId: userForm.roleId,
            departmentId: userForm.departmentId || null,
            isActive: userForm.isActive === "true",
            sessionTimeoutMinutes: Number(userForm.sessionTimeoutMinutes),
          }),
        });
        flash("Staff user created.");
      } else if (editingUser) {
        await apiFetch(`/api/accounts/users/${editingUser.id}`, {
          method: "PUT",
          body: JSON.stringify({
            email: userForm.email,
            fullName: userForm.fullName,
            roleId: userForm.roleId,
            departmentId: userForm.departmentId || null,
            isActive: userForm.isActive === "true",
            sessionTimeoutMinutes: Number(userForm.sessionTimeoutMinutes),
          }),
        });
        if (passwordForm.trim()) {
          await apiFetch(`/api/accounts/users/${editingUser.id}/password`, {
            method: "POST",
            body: JSON.stringify({ password: passwordForm }),
          });
        }
        if (editingUser.id !== me?.id) {
          await apiFetch(`/api/accounts/users/${editingUser.id}/overrides`, {
            method: "PUT",
            body: JSON.stringify({ overrides }),
          });
        }
        flash("Staff user updated.");
      }
      setEditingUser(null);
      await load();
    } catch (err) {
      fail(err);
    }
  }

  async function deactivateUser(id: string) {
    if (!confirm("Deactivate this staff user? They will no longer be able to sign in.")) return;
    try {
      await apiFetch(`/api/accounts/users/${id}`, { method: "DELETE" });
      flash("User deactivated.");
      await load();
    } catch (err) {
      fail(err);
    }
  }

  // ── Roles ─────────────────────────────────────────────────────────────────

  function openNewRole() {
    setEditingRole("new");
    setRoleForm({ name: "", description: "" });
    setRolePerms({});
  }

  function openEditRole(r: Role) {
    setEditingRole(r);
    setRoleForm({ name: r.name, description: r.description ?? "" });
    setRolePerms({ ...r.permissions });
  }

  function toggleRolePerm(module: string, action: string) {
    setRolePerms((prev) => {
      const current = new Set(prev[module] ?? []);
      if (current.has(action)) current.delete(action);
      else current.add(action);
      const next = { ...prev };
      if (current.size) next[module] = [...current];
      else delete next[module];
      return next;
    });
  }

  async function saveRole() {
    try {
      if (editingRole === "new") {
        await apiFetch("/api/accounts/roles", {
          method: "POST",
          body: JSON.stringify({
            name: roleForm.name,
            description: roleForm.description || undefined,
            permissions: rolePerms,
          }),
        });
        flash("Role created.");
      } else if (editingRole) {
        await apiFetch(`/api/accounts/roles/${editingRole.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: roleForm.name,
            description: roleForm.description || null,
            permissions: rolePerms,
          }),
        });
        flash("Role updated.");
      }
      setEditingRole(null);
      await load();
    } catch (err) {
      fail(err);
    }
  }

  async function removeRole(id: string) {
    if (!confirm("Delete this role? Users must be reassigned first.")) return;
    try {
      await apiFetch(`/api/accounts/roles/${id}`, { method: "DELETE" });
      flash("Role deleted.");
      await load();
    } catch (err) {
      fail(err);
    }
  }

  // ── Guests ────────────────────────────────────────────────────────────────

  function openNewGuest() {
    setEditingGuest("new");
    setGuestForm({
      firstName: "", lastName: "", email: "", phone: "", nationality: "",
      nationalId: "", passportNumber: "", vipStatus: "NONE", notes: "", password: "",
    });
    setGuestPassword("");
  }

  function openEditGuest(g: GuestAccount) {
    setEditingGuest(g);
    setGuestForm({
      firstName: g.firstName,
      lastName: g.lastName,
      email: g.email,
      phone: g.phone ?? "",
      nationality: g.nationality ?? "",
      nationalId: g.nationalId ?? "",
      passportNumber: g.passportNumber ?? "",
      vipStatus: g.vipStatus,
      notes: g.notes ?? "",
    });
    setGuestPassword("");
  }

  async function saveGuest() {
    try {
      if (editingGuest === "new") {
        await apiFetch("/api/accounts/guests", {
          method: "POST",
          body: JSON.stringify({
            firstName: guestForm.firstName,
            lastName: guestForm.lastName,
            email: guestForm.email,
            phone: guestForm.phone || undefined,
            nationality: guestForm.nationality || undefined,
            nationalId: guestForm.nationalId || undefined,
            passportNumber: guestForm.passportNumber || undefined,
            vipStatus: guestForm.vipStatus,
            notes: guestForm.notes || undefined,
            password: guestForm.password || undefined,
          }),
        });
        flash("Guest account created.");
      } else if (editingGuest) {
        await apiFetch(`/api/accounts/guests/${editingGuest.id}`, {
          method: "PUT",
          body: JSON.stringify({
            firstName: guestForm.firstName,
            lastName: guestForm.lastName,
            email: guestForm.email,
            phone: guestForm.phone || null,
            nationality: guestForm.nationality || null,
            nationalId: guestForm.nationalId || null,
            passportNumber: guestForm.passportNumber || null,
            vipStatus: guestForm.vipStatus,
            notes: guestForm.notes || null,
          }),
        });
        if (guestPassword.trim()) {
          await apiFetch(`/api/accounts/guests/${editingGuest.id}/portal-password`, {
            method: "POST",
            body: JSON.stringify({ password: guestPassword }),
          });
        }
        flash("Guest account updated.");
      }
      setEditingGuest(null);
      await load();
    } catch (err) {
      fail(err);
    }
  }

  async function disableGuestPortal(id: string) {
    if (!confirm("Disable portal login for this guest?")) return;
    try {
      await apiFetch(`/api/accounts/guests/${id}/portal-access`, { method: "DELETE" });
      flash("Portal access disabled.");
      await load();
    } catch (err) {
      fail(err);
    }
  }

  async function deleteGuest(id: string) {
    if (!confirm("Delete this guest account? Profiles with history will only lose portal access.")) return;
    try {
      const result = await apiFetch<{ message?: string; deleted?: boolean }>(`/api/accounts/guests/${id}`, {
        method: "DELETE",
      });
      flash(result.message ?? (result.deleted ? "Guest deleted." : "Done."));
      await load();
    } catch (err) {
      fail(err);
    }
  }

  const tabs = useMemo(() => ([
    { id: "users" as const, label: "Staff users" },
    { id: "roles" as const, label: "Roles & access" },
    { id: "guests" as const, label: "Guest accounts" },
  ]), []);

  const selectedRole = roles.find((r) => r.id === userForm.roleId);

  return (
    <div className="p-6">
      <PageHeader
        title="Accounts"
        description="Manage staff users with role-based access rights, and guest portal accounts"
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex flex-wrap gap-2 border-b border-[hsl(var(--border))] flex-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`msh-tab ${tab === t.id ? "msh-tab-active" : ""}`}
              onClick={() => { setTab(t.id); setEditingUser(null); setEditingRole(null); setEditingGuest(null); }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="msh-input max-w-xs"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <div className="mb-4 bg-red-50 text-red-700 text-sm px-4 py-3 rounded border border-red-200">{error}</div>}
      {message && <p className="mb-4 text-sm text-emerald-700">{message}</p>}

      {tab === "users" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Access is granted through roles. Per-user overrides can grant or deny specific actions.
            </p>
            <button type="button" className="msh-btn msh-btn-primary" onClick={openNewUser}>Add staff user</button>
          </div>

          {editingUser && (
            <div className="msh-card p-4 max-w-4xl space-y-4">
              <h2 className="font-semibold">{editingUser === "new" ? "Create staff user" : "Edit staff user"}</h2>
              <div className="grid md:grid-cols-2 gap-3">
                {editingUser === "new" && (
                  <>
                    <Field label="Username" value={userForm.username ?? ""} onChange={(v) => setUserForm({ ...userForm, username: v })} />
                    <Field label="Temporary password" type="password" value={userForm.password ?? ""} onChange={(v) => setUserForm({ ...userForm, password: v })} />
                  </>
                )}
                <Field label="Full name" value={userForm.fullName ?? ""} onChange={(v) => setUserForm({ ...userForm, fullName: v })} />
                <Field label="Email" type="email" value={userForm.email ?? ""} onChange={(v) => setUserForm({ ...userForm, email: v })} />
                <label className="text-sm block">
                  Role (access rights)
                  <select className="msh-input mt-1" value={userForm.roleId} onChange={(e) => setUserForm({ ...userForm, roleId: e.target.value })}>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </label>
                <label className="text-sm block">
                  Department
                  <select className="msh-input mt-1" value={userForm.departmentId} onChange={(e) => setUserForm({ ...userForm, departmentId: e.target.value })}>
                    <option value="">None</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
                <label className="text-sm block">
                  Active
                  <select className="msh-input mt-1" value={userForm.isActive} onChange={(e) => setUserForm({ ...userForm, isActive: e.target.value })}>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </label>
                <Field
                  label="Session timeout (minutes)"
                  type="number"
                  min={5}
                  value={userForm.sessionTimeoutMinutes ?? "20"}
                  onChange={(v) => setUserForm({ ...userForm, sessionTimeoutMinutes: v })}
                />
                {editingUser !== "new" && (
                  <Field
                    label="Reset password (optional)"
                    type="password"
                    value={passwordForm}
                    onChange={setPasswordForm}
                  />
                )}
              </div>

              {selectedRole && (
                <div className="text-sm bg-[hsl(var(--muted))] rounded p-3">
                  <strong>{selectedRole.name}</strong> grants {permSummary(selectedRole.permissions)}:
                  {" "}
                  {Object.entries(selectedRole.permissions)
                    .filter(([, a]) => a.length)
                    .map(([m, a]) => `${m} (${a.join(", ")})`)
                    .join(" · ") || "none"}
                </div>
              )}

              {editingUser !== "new" && editingUser.id !== me?.id && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Permission overrides</h3>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mb-2">
                    Grant or deny a specific action beyond the role. You can only grant rights you hold.
                  </p>
                  <div className="space-y-2">
                    {overrides.map((o, idx) => (
                      <div key={`${o.module}-${o.action}-${idx}`} className="flex flex-wrap gap-2 items-center">
                        <select
                          className="msh-input"
                          value={o.module}
                          onChange={(e) => {
                            const next = [...overrides];
                            next[idx] = { ...o, module: e.target.value };
                            setOverrides(next);
                          }}
                        >
                          {modules.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <select
                          className="msh-input"
                          value={o.action}
                          onChange={(e) => {
                            const next = [...overrides];
                            next[idx] = { ...o, action: e.target.value };
                            setOverrides(next);
                          }}
                        >
                          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                        <select
                          className="msh-input"
                          value={String(o.isAllowed)}
                          onChange={(e) => {
                            const next = [...overrides];
                            next[idx] = { ...o, isAllowed: e.target.value === "true" };
                            setOverrides(next);
                          }}
                        >
                          <option value="true">Grant</option>
                          <option value="false">Deny</option>
                        </select>
                        <button
                          type="button"
                          className="msh-btn msh-btn-outline text-xs"
                          onClick={() => setOverrides(overrides.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="msh-btn msh-btn-outline text-xs"
                      onClick={() => setOverrides([...overrides, { module: modules[0] ?? "Reservations", action: "VIEW", isAllowed: true }])}
                    >
                      Add override
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button type="button" className="msh-btn msh-btn-primary" onClick={saveUser}>Save</button>
                <button type="button" className="msh-btn msh-btn-outline" onClick={() => setEditingUser(null)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto msh-card">
            <table className="w-full text-sm">
              <thead className="bg-[hsl(var(--muted))] text-left">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Username</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Overrides</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-[hsl(var(--border))]">
                    <td className="p-3 font-medium">{u.fullName}</td>
                    <td className="p-3">{u.username}</td>
                    <td className="p-3">{u.role.name}</td>
                    <td className="p-3">{u.department?.name ?? "—"}</td>
                    <td className="p-3">{u.isActive ? "Active" : "Inactive"}</td>
                    <td className="p-3">{u.permissionOverrides.length}</td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <button type="button" className="msh-btn msh-btn-outline text-xs" onClick={() => openEditUser(u)}>Edit</button>
                      {u.isActive && u.id !== me?.id && (
                        <button type="button" className="msh-btn msh-btn-outline text-xs" onClick={() => deactivateUser(u.id)}>Deactivate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "roles" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Roles define which modules and actions a staff user may perform (least privilege).
            </p>
            <button type="button" className="msh-btn msh-btn-primary" onClick={openNewRole}>Add role</button>
          </div>

          {editingRole && (
            <div className="msh-card p-4 space-y-4">
              <h2 className="font-semibold">{editingRole === "new" ? "Create role" : "Edit role"}</h2>
              <div className="grid md:grid-cols-2 gap-3 max-w-2xl">
                <Field label="Name" value={roleForm.name} onChange={(v) => setRoleForm({ ...roleForm, name: v })} />
                <Field label="Description" value={roleForm.description} onChange={(v) => setRoleForm({ ...roleForm, description: v })} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[hsl(var(--muted))] text-left">
                    <tr>
                      <th className="p-2 sticky left-0 bg-[hsl(var(--muted))]">Module</th>
                      {actions.map((a) => <th key={a} className="p-2 text-center">{a}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((m) => (
                      <tr key={m} className="border-t border-[hsl(var(--border))]">
                        <td className="p-2 font-medium sticky left-0 bg-[hsl(var(--card))]">{m}</td>
                        {actions.map((a) => {
                          const on = (rolePerms[m] ?? []).includes(a);
                          return (
                            <td key={a} className="p-2 text-center">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => toggleRolePerm(m, a)}
                                aria-label={`${m} ${a}`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <button type="button" className="msh-btn msh-btn-primary" onClick={saveRole}>Save</button>
                <button type="button" className="msh-btn msh-btn-outline" onClick={() => setEditingRole(null)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto msh-card">
            <table className="w-full text-sm">
              <thead className="bg-[hsl(var(--muted))] text-left">
                <tr>
                  <th className="p-3">Role</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Access</th>
                  <th className="p-3">Users</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.id} className="border-t border-[hsl(var(--border))]">
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3">{r.description ?? "—"}</td>
                    <td className="p-3">{permSummary(r.permissions)}</td>
                    <td className="p-3">{r._count?.users ?? 0}</td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <button type="button" className="msh-btn msh-btn-outline text-xs" onClick={() => openEditRole(r)}>Edit</button>
                      {r.name !== "System Administrator" && (
                        <button type="button" className="msh-btn msh-btn-outline text-xs" onClick={() => removeRole(r.id)}>Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "guests" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Guest portal accounts use email + password. Profiles with booking history cannot be hard-deleted.
            </p>
            <button type="button" className="msh-btn msh-btn-primary" onClick={openNewGuest}>Add guest account</button>
          </div>

          {editingGuest && (
            <div className="msh-card p-4 max-w-3xl space-y-4">
              <h2 className="font-semibold">{editingGuest === "new" ? "Create guest account" : "Edit guest account"}</h2>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="First name" value={guestForm.firstName ?? ""} onChange={(v) => setGuestForm({ ...guestForm, firstName: v })} />
                <Field label="Last name" value={guestForm.lastName ?? ""} onChange={(v) => setGuestForm({ ...guestForm, lastName: v })} />
                <Field label="Email" type="email" value={guestForm.email ?? ""} onChange={(v) => setGuestForm({ ...guestForm, email: v })} />
                <Field label="Phone" value={guestForm.phone ?? ""} onChange={(v) => setGuestForm({ ...guestForm, phone: v })} />
                <Field label="Nationality" value={guestForm.nationality ?? ""} onChange={(v) => setGuestForm({ ...guestForm, nationality: v })} />
                <Field label="National ID" value={guestForm.nationalId ?? ""} onChange={(v) => setGuestForm({ ...guestForm, nationalId: v })} />
                <Field label="Passport" value={guestForm.passportNumber ?? ""} onChange={(v) => setGuestForm({ ...guestForm, passportNumber: v })} />
                <label className="text-sm block">
                  VIP
                  <select className="msh-input mt-1" value={guestForm.vipStatus} onChange={(e) => setGuestForm({ ...guestForm, vipStatus: e.target.value })}>
                    {VIP.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <label className="text-sm block md:col-span-2">
                  Notes
                  <input className="msh-input mt-1" value={guestForm.notes ?? ""} onChange={(e) => setGuestForm({ ...guestForm, notes: e.target.value })} />
                </label>
                {editingGuest === "new" ? (
                  <Field
                    label="Portal password (optional)"
                    type="password"
                    value={guestForm.password ?? ""}
                    onChange={(v) => setGuestForm({ ...guestForm, password: v })}
                  />
                ) : (
                  <Field
                    label="Set / reset portal password (optional)"
                    type="password"
                    value={guestPassword}
                    onChange={setGuestPassword}
                  />
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" className="msh-btn msh-btn-primary" onClick={saveGuest}>Save</button>
                <button type="button" className="msh-btn msh-btn-outline" onClick={() => setEditingGuest(null)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto msh-card">
            <table className="w-full text-sm">
              <thead className="bg-[hsl(var(--muted))] text-left">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Portal</th>
                  <th className="p-3">Bookings</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {guests.map((g) => (
                  <tr key={g.id} className="border-t border-[hsl(var(--border))]">
                    <td className="p-3 font-medium">{g.firstName} {g.lastName}</td>
                    <td className="p-3">{g.email}</td>
                    <td className="p-3">{g.phone ?? "—"}</td>
                    <td className="p-3">{g.hasPortalAccount ? "Enabled" : "Off"}</td>
                    <td className="p-3">{g._count?.reservations ?? 0}</td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <button type="button" className="msh-btn msh-btn-outline text-xs" onClick={() => openEditGuest(g)}>Edit</button>
                      {g.hasPortalAccount && (
                        <button type="button" className="msh-btn msh-btn-outline text-xs" onClick={() => disableGuestPortal(g.id)}>Disable portal</button>
                      )}
                      <button type="button" className="msh-btn msh-btn-outline text-xs" onClick={() => deleteGuest(g.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
