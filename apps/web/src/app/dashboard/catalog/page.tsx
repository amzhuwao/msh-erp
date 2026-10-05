"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

type Tab = "rooms" | "conference" | "menu" | "services";

interface RoomType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  maxAdults: number;
  maxChildren: number;
  baseRate: string;
  ratePlans: { id: string; code: string; name: string; baseRate: string; isActive: boolean }[];
  _count: { rooms: number };
}

interface Room {
  id: string;
  number: string;
  floor: number;
  roomTypeId: string;
  status: string;
  isActive: boolean;
  roomType: { name: string; code: string };
}

interface Venue {
  id: string;
  name: string;
  locationDescription: string | null;
  maxCapacityBanquet: number;
  maxCapacityCinema: number;
  maxCapacityBoardroom: number;
  halfDayRate: string;
  fullDayRate: string;
  isActive: boolean;
}

interface Package {
  id: string;
  name: string;
  ratePerPax: string;
  details: { notes?: string } | null;
  isActive: boolean;
}

interface Resource {
  id: string;
  name: string;
  totalInventoryCount: number;
  dailyRentalRate: string;
  category: string;
}

interface Outlet {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

interface MenuItem {
  id: string;
  outletId: string;
  code: string;
  name: string;
  category: string;
  price: string;
  cost: string;
  taxRate: string;
  mealPeriod: string | null;
  isActive: boolean;
  outlet: { id: string; code: string; name: string };
}

interface ServiceItem {
  id: string;
  code: string;
  name: string;
  category: string;
  mealPeriod: string | null;
  price: string;
  taxRate: string;
  isActive: boolean;
}

const ROOM_STATUSES = [
  "INSPECTED", "VACANT_CLEAN", "VACANT_DIRTY", "OCCUPIED", "OCCUPIED_DIRTY",
  "CLEANING_IN_PROGRESS", "OUT_OF_ORDER", "OUT_OF_SERVICE", "MAINTENANCE",
];

const RESOURCE_CATEGORIES = ["AV", "FURNITURE", "DECOR", "IT"];

function money(value: string | number) {
  return `$${Number(value).toFixed(2)}`;
}

function Field({
  label, value, onChange, type = "text", min, step,
}: {
  label: string; value: string | number; onChange: (v: string) => void; type?: string; min?: number; step?: string;
}) {
  return (
    <label className="text-sm block">
      {label}
      <input
        className="msh-input mt-1"
        type={type}
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export default function CatalogPage() {
  const [tab, setTab] = useState<Tab>("rooms");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [serviceItems, setServiceItems] = useState<ServiceItem[]>([]);
  const [editing, setEditing] = useState<{ kind: string; id: string | null } | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [rt, rm, vn, pk, rs, ot, mi, sv] = await Promise.all([
      apiFetch<{ items: RoomType[] }>("/api/catalog/room-types"),
      apiFetch<{ items: Room[] }>("/api/catalog/rooms"),
      apiFetch<{ items: Venue[] }>("/api/catalog/venues"),
      apiFetch<{ items: Package[] }>("/api/catalog/packages"),
      apiFetch<{ items: Resource[] }>("/api/catalog/resources"),
      apiFetch<{ items: Outlet[] }>("/api/catalog/outlets"),
      apiFetch<{ items: MenuItem[] }>("/api/catalog/menu-items"),
      apiFetch<{ items: ServiceItem[] }>("/api/catalog/service-items"),
    ]);
    setRoomTypes(rt.items);
    setRooms(rm.items);
    setVenues(vn.items);
    setPackages(pk.items);
    setResources(rs.items);
    setOutlets(ot.items);
    setMenuItems(mi.items);
    setServiceItems(sv.items);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load catalog"));
  }, [load]);

  function openCreate(kind: string, defaults: Record<string, string> = {}) {
    setEditing({ kind, id: null });
    setForm(defaults);
    setMessage("");
    setError("");
  }

  function openEdit(kind: string, id: string, defaults: Record<string, string>) {
    setEditing({ kind, id });
    setForm(defaults);
    setMessage("");
    setError("");
  }

  async function save() {
    if (!editing) return;
    setError("");
    setMessage("");
    try {
      const { kind, id } = editing;
      const path =
        kind === "roomType" ? (id ? `/api/catalog/room-types/${id}` : "/api/catalog/room-types")
        : kind === "room" ? (id ? `/api/catalog/rooms/${id}` : "/api/catalog/rooms")
        : kind === "venue" ? (id ? `/api/catalog/venues/${id}` : "/api/catalog/venues")
        : kind === "package" ? (id ? `/api/catalog/packages/${id}` : "/api/catalog/packages")
        : kind === "resource" ? (id ? `/api/catalog/resources/${id}` : "/api/catalog/resources")
        : kind === "outlet" ? (id ? `/api/catalog/outlets/${id}` : "/api/catalog/outlets")
        : kind === "menuItem" ? (id ? `/api/catalog/menu-items/${id}` : "/api/catalog/menu-items")
        : kind === "serviceItem" ? (id ? `/api/catalog/service-items/${id}` : "/api/catalog/service-items")
        : "";

      const payload: Record<string, unknown> = { ...form };
      if (id && "code" in payload) delete payload.code;
      for (const key of [
        "baseRate", "halfDayRate", "fullDayRate", "ratePerPax", "dailyRentalRate",
        "price", "cost", "taxRate", "maxAdults", "maxChildren", "floor",
        "maxCapacityBanquet", "maxCapacityCinema", "maxCapacityBoardroom", "totalInventoryCount",
      ]) {
        if (key in payload && payload[key] !== "") payload[key] = Number(payload[key]);
      }
      if ("isActive" in payload) payload.isActive = form.isActive === "true";
      if (payload.mealPeriod === "") payload.mealPeriod = null;
      if (payload.details === "") delete payload.details;
      if (payload.description === "") delete payload.description;
      if (payload.locationDescription === "") delete payload.locationDescription;

      await apiFetch(path, {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setMessage(id ? "Updated." : "Created.");
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  const tabs = useMemo(() => ([
    { id: "rooms" as const, label: "Rooms & rates" },
    { id: "conference" as const, label: "Conference" },
    { id: "menu" as const, label: "Restaurant & meals" },
    { id: "services" as const, label: "Guest services" },
  ]), []);

  return (
    <div className="p-6">
      <PageHeader
        title="Catalog & pricing"
        description="Create and edit rooms, conference facilities, restaurant sellable items, and guest-service meals with their prices"
      />

      <div className="flex flex-wrap gap-2 border-b border-[hsl(var(--border))] mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`msh-tab ${tab === t.id ? "msh-tab-active" : ""}`}
            onClick={() => { setTab(t.id); setEditing(null); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 bg-red-50 text-red-700 text-sm px-4 py-3 rounded border border-red-200">{error}</div>}
      {message && <p className="mb-4 text-sm text-emerald-700">{message}</p>}

      {editing && (
        <div className="msh-card p-4 mb-6 max-w-3xl">
          <h2 className="font-semibold mb-3">{editing.id ? "Edit" : "Create"} {editing.kind}</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {Object.keys(form).map((key) => {
              if (key === "roomTypeId") {
                return (
                  <label key={key} className="text-sm block">
                    Room type
                    <select className="msh-input mt-1" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
                      <option value="">Select…</option>
                      {roomTypes.map((rt) => <option key={rt.id} value={rt.id}>{rt.name} ({rt.code})</option>)}
                    </select>
                  </label>
                );
              }
              if (key === "outletId") {
                return (
                  <label key={key} className="text-sm block">
                    Outlet
                    <select className="msh-input mt-1" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
                      <option value="">Select…</option>
                      {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </label>
                );
              }
              if (key === "status") {
                return (
                  <label key={key} className="text-sm block">
                    Status
                    <select className="msh-input mt-1" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
                      {ROOM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                );
              }
              if (key === "category" && editing.kind === "resource") {
                return (
                  <label key={key} className="text-sm block">
                    Category
                    <select className="msh-input mt-1" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
                      {RESOURCE_CATEGORIES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                );
              }
              if (key === "isActive") {
                return (
                  <label key={key} className="text-sm block">
                    Active
                    <select className="msh-input mt-1" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </label>
                );
              }
              if (key === "code" && editing.id) {
                return (
                  <label key={key} className="text-sm block">
                    Code
                    <input className="msh-input mt-1 bg-[hsl(var(--muted))]" value={form[key]} disabled />
                  </label>
                );
              }
              const numeric = [
                "baseRate", "halfDayRate", "fullDayRate", "ratePerPax", "dailyRentalRate",
                "price", "cost", "taxRate", "maxAdults", "maxChildren", "floor",
                "maxCapacityBanquet", "maxCapacityCinema", "maxCapacityBoardroom", "totalInventoryCount",
              ].includes(key);
              return (
                <Field
                  key={key}
                  label={key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
                  value={form[key] ?? ""}
                  type={numeric ? "number" : "text"}
                  min={0}
                  step={key === "taxRate" ? "0.01" : numeric ? "0.01" : undefined}
                  onChange={(v) => setForm({ ...form, [key]: v })}
                />
              );
            })}
          </div>
          <div className="flex gap-2 mt-4">
            <button type="button" className="msh-btn msh-btn-primary" onClick={save}>Save</button>
            <button type="button" className="msh-btn msh-btn-outline" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      {tab === "rooms" && (
        <div className="space-y-8">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Room types & nightly rates</h2>
              <button
                type="button"
                className="msh-btn msh-btn-primary"
                onClick={() => openCreate("roomType", {
                  code: "", name: "", description: "", maxAdults: "2", maxChildren: "1", baseRate: "100",
                })}
              >
                Add room type
              </button>
            </div>
            <div className="overflow-x-auto msh-card">
              <table className="w-full text-sm">
                <thead className="bg-[hsl(var(--muted))] text-left">
                  <tr>
                    <th className="p-3">Code</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Capacity</th>
                    <th className="p-3">Nightly rate</th>
                    <th className="p-3">Rooms</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {roomTypes.map((rt) => (
                    <tr key={rt.id} className="border-t border-[hsl(var(--border))]">
                      <td className="p-3 font-medium">{rt.code}</td>
                      <td className="p-3">{rt.name}</td>
                      <td className="p-3">{rt.maxAdults}A / {rt.maxChildren}C</td>
                      <td className="p-3">{money(rt.baseRate)}</td>
                      <td className="p-3">{rt._count.rooms}</td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          className="msh-btn msh-btn-outline text-xs"
                          onClick={() => openEdit("roomType", rt.id, {
                            name: rt.name,
                            description: rt.description ?? "",
                            maxAdults: String(rt.maxAdults),
                            maxChildren: String(rt.maxChildren),
                            baseRate: String(Number(rt.baseRate)),
                          })}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Physical rooms</h2>
              <button
                type="button"
                className="msh-btn msh-btn-primary"
                onClick={() => openCreate("room", {
                  number: "", floor: "1", roomTypeId: roomTypes[0]?.id ?? "", status: "INSPECTED", isActive: "true",
                })}
              >
                Add room
              </button>
            </div>
            <div className="overflow-x-auto msh-card">
              <table className="w-full text-sm">
                <thead className="bg-[hsl(var(--muted))] text-left">
                  <tr>
                    <th className="p-3">Number</th>
                    <th className="p-3">Floor</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Active</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((r) => (
                    <tr key={r.id} className="border-t border-[hsl(var(--border))]">
                      <td className="p-3 font-medium">{r.number}</td>
                      <td className="p-3">{r.floor}</td>
                      <td className="p-3">{r.roomType.name}</td>
                      <td className="p-3">{r.status}</td>
                      <td className="p-3">{r.isActive ? "Yes" : "No"}</td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          className="msh-btn msh-btn-outline text-xs"
                          onClick={() => openEdit("room", r.id, {
                            number: r.number,
                            floor: String(r.floor),
                            roomTypeId: r.roomTypeId,
                            status: r.status,
                            isActive: String(r.isActive),
                          })}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === "conference" && (
        <div className="space-y-8">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Venues</h2>
              <button
                type="button"
                className="msh-btn msh-btn-primary"
                onClick={() => openCreate("venue", {
                  name: "", locationDescription: "", maxCapacityBanquet: "50", maxCapacityCinema: "80",
                  maxCapacityBoardroom: "20", halfDayRate: "200", fullDayRate: "350", isActive: "true",
                })}
              >
                Add venue
              </button>
            </div>
            <div className="overflow-x-auto msh-card">
              <table className="w-full text-sm">
                <thead className="bg-[hsl(var(--muted))] text-left">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">Half day</th>
                    <th className="p-3">Full day</th>
                    <th className="p-3">Capacity (B/C/Br)</th>
                    <th className="p-3">Active</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {venues.map((v) => (
                    <tr key={v.id} className="border-t border-[hsl(var(--border))]">
                      <td className="p-3 font-medium">{v.name}</td>
                      <td className="p-3">{money(v.halfDayRate)}</td>
                      <td className="p-3">{money(v.fullDayRate)}</td>
                      <td className="p-3">{v.maxCapacityBanquet}/{v.maxCapacityCinema}/{v.maxCapacityBoardroom}</td>
                      <td className="p-3">{v.isActive ? "Yes" : "No"}</td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          className="msh-btn msh-btn-outline text-xs"
                          onClick={() => openEdit("venue", v.id, {
                            name: v.name,
                            locationDescription: v.locationDescription ?? "",
                            maxCapacityBanquet: String(v.maxCapacityBanquet),
                            maxCapacityCinema: String(v.maxCapacityCinema),
                            maxCapacityBoardroom: String(v.maxCapacityBoardroom),
                            halfDayRate: String(Number(v.halfDayRate)),
                            fullDayRate: String(Number(v.fullDayRate)),
                            isActive: String(v.isActive),
                          })}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Catering packages</h2>
              <button
                type="button"
                className="msh-btn msh-btn-primary"
                onClick={() => openCreate("package", { name: "", ratePerPax: "25", details: "", isActive: "true" })}
              >
                Add package
              </button>
            </div>
            <div className="overflow-x-auto msh-card">
              <table className="w-full text-sm">
                <thead className="bg-[hsl(var(--muted))] text-left">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">Rate / pax</th>
                    <th className="p-3">Active</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {packages.map((p) => (
                    <tr key={p.id} className="border-t border-[hsl(var(--border))]">
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3">{money(p.ratePerPax)}</td>
                      <td className="p-3">{p.isActive ? "Yes" : "No"}</td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          className="msh-btn msh-btn-outline text-xs"
                          onClick={() => openEdit("package", p.id, {
                            name: p.name,
                            ratePerPax: String(Number(p.ratePerPax)),
                            details: p.details?.notes ?? "",
                            isActive: String(p.isActive),
                          })}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">AV & equipment</h2>
              <button
                type="button"
                className="msh-btn msh-btn-primary"
                onClick={() => openCreate("resource", {
                  name: "", totalInventoryCount: "1", dailyRentalRate: "20", category: "AV",
                })}
              >
                Add resource
              </button>
            </div>
            <div className="overflow-x-auto msh-card">
              <table className="w-full text-sm">
                <thead className="bg-[hsl(var(--muted))] text-left">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Stock</th>
                    <th className="p-3">Daily rate</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {resources.map((r) => (
                    <tr key={r.id} className="border-t border-[hsl(var(--border))]">
                      <td className="p-3 font-medium">{r.name}</td>
                      <td className="p-3">{r.category}</td>
                      <td className="p-3">{r.totalInventoryCount}</td>
                      <td className="p-3">{money(r.dailyRentalRate)}</td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          className="msh-btn msh-btn-outline text-xs"
                          onClick={() => openEdit("resource", r.id, {
                            name: r.name,
                            totalInventoryCount: String(r.totalInventoryCount),
                            dailyRentalRate: String(Number(r.dailyRentalRate)),
                            category: r.category,
                          })}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === "menu" && (
        <div className="space-y-8">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Outlets</h2>
              <button
                type="button"
                className="msh-btn msh-btn-primary"
                onClick={() => openCreate("outlet", { code: "", name: "", isActive: "true" })}
              >
                Add outlet
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              {outlets.map((o) => (
                <div key={o.id} className="msh-card p-4 min-w-[180px]">
                  <p className="font-medium">{o.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{o.code} · {o.isActive ? "Active" : "Inactive"}</p>
                  <button
                    type="button"
                    className="msh-btn msh-btn-outline text-xs mt-2"
                    onClick={() => openEdit("outlet", o.id, { name: o.name, isActive: String(o.isActive) })}
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Menu / sellable items</h2>
              <button
                type="button"
                className="msh-btn msh-btn-primary"
                onClick={() => openCreate("menuItem", {
                  outletId: outlets[0]?.id ?? "",
                  code: "",
                  name: "",
                  category: "Mains",
                  price: "10",
                  cost: "0",
                  taxRate: "0.15",
                  mealPeriod: "",
                  isActive: "true",
                })}
              >
                Add menu item
              </button>
            </div>
            <div className="overflow-x-auto msh-card">
              <table className="w-full text-sm">
                <thead className="bg-[hsl(var(--muted))] text-left">
                  <tr>
                    <th className="p-3">Code</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Outlet</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Meal period</th>
                    <th className="p-3">Price</th>
                    <th className="p-3">Active</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {menuItems.map((m) => (
                    <tr key={m.id} className="border-t border-[hsl(var(--border))]">
                      <td className="p-3 font-medium">{m.code}</td>
                      <td className="p-3">{m.name}</td>
                      <td className="p-3">{m.outlet.name}</td>
                      <td className="p-3">{m.category}</td>
                      <td className="p-3">{m.mealPeriod || "—"}</td>
                      <td className="p-3">{money(m.price)}</td>
                      <td className="p-3">{m.isActive ? "Yes" : "No"}</td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          className="msh-btn msh-btn-outline text-xs"
                          onClick={() => openEdit("menuItem", m.id, {
                            outletId: m.outletId,
                            name: m.name,
                            category: m.category,
                            price: String(Number(m.price)),
                            cost: String(Number(m.cost)),
                            taxRate: String(Number(m.taxRate)),
                            mealPeriod: m.mealPeriod ?? "",
                            isActive: String(m.isActive),
                          })}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === "services" && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Guest service & meal catalog</h2>
            <button
              type="button"
              className="msh-btn msh-btn-primary"
              onClick={() => openCreate("serviceItem", {
                code: "", name: "", category: "Meals", mealPeriod: "", price: "10", taxRate: "0.15", isActive: "true",
              })}
            >
              Add service / meal
            </button>
          </div>
          <div className="overflow-x-auto msh-card">
            <table className="w-full text-sm">
              <thead className="bg-[hsl(var(--muted))] text-left">
                <tr>
                  <th className="p-3">Code</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Meal period</th>
                  <th className="p-3">Price</th>
                  <th className="p-3">Active</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {serviceItems.map((s) => (
                  <tr key={s.id} className="border-t border-[hsl(var(--border))]">
                    <td className="p-3 font-medium">{s.code}</td>
                    <td className="p-3">{s.name}</td>
                    <td className="p-3">{s.category}</td>
                    <td className="p-3">{s.mealPeriod || "—"}</td>
                    <td className="p-3">{money(s.price)}</td>
                    <td className="p-3">{s.isActive ? "Yes" : "No"}</td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        className="msh-btn msh-btn-outline text-xs"
                        onClick={() => openEdit("serviceItem", s.id, {
                          name: s.name,
                          category: s.category,
                          mealPeriod: s.mealPeriod ?? "",
                          price: String(Number(s.price)),
                          taxRate: String(Number(s.taxRate)),
                          isActive: String(s.isActive),
                        })}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
