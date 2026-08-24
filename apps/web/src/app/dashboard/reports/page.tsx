"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

const REPORTS = [
  { id: "sales", label: "Sales (department + ZTA)" },
  { id: "zta", label: "ZTA levy" },
  { id: "food-covers", label: "Food covers" },
  { id: "vat", label: "ZIMRA VAT" },
  { id: "reservations", label: "Reservations + services" },
  { id: "revenue", label: "Revenue KPI" },
  { id: "arrivals", label: "Arrivals" },
  { id: "inventory", label: "Inventory valuation" },
  { id: "trial-balance", label: "Trial balance" },
] as const;

export default function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [dataset, setDataset] = useState<(typeof REPORTS)[number]["id"]>("sales");
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function run(id = dataset) {
    setLoading(true);
    try {
      setData(await apiFetch("/api/reports/custom/build", {
        method: "POST",
        body: JSON.stringify({ dataset: id, date: startDate, startDate, endDate }),
      }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { run("sales"); }, []);

  return (
    <div className="p-6">
      <PageHeader title="Reporting & BI" description="Custom date range on every report. Sales, ZTA, food covers, ZIMRA VAT, and reservation services." />
      <div className="flex flex-wrap gap-2 mb-4 items-end">
        <label className="text-sm">From<input type="date" className="msh-input mt-1" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label className="text-sm">To<input type="date" className="msh-input mt-1" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        <button className="msh-btn msh-btn-primary" onClick={() => run()} disabled={loading}>{loading ? "Running…" : "Run"}</button>
      </div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {REPORTS.map((r) => (
          <button
            key={r.id}
            className={`msh-btn ${dataset === r.id ? "msh-btn-primary" : "msh-btn-outline"}`}
            onClick={() => { setDataset(r.id); run(r.id); }}
          >
            {r.label}
          </button>
        ))}
      </div>
      {data !== null && <ReportView dataset={dataset} data={data} />}
    </div>
  );
}

function ReportView({ dataset, data }: { dataset: string; data: unknown }) {
  if (dataset === "sales") return <SalesView data={data as Sales} />;
  if (dataset === "zta") return <ZtaView data={data as Zta} />;
  if (dataset === "food-covers") return <CoversView data={data as Covers} />;
  if (dataset === "vat") return <VatView data={data as Vat} />;
  if (dataset === "reservations") return <ResView data={data as ResRpt} />;
  return <pre className="msh-card p-4 text-xs overflow-auto max-h-[520px]">{JSON.stringify(data, null, 2)}</pre>;
}

interface Sales {
  departments: { department: string; net: number; vat: number; zta: number; gross: number }[];
  invoices: { guest: string; room: string | null; services: { description: string; gross: number; vat: number }[]; gross: number; vat: number }[];
  totals: { net: number; vat: number; zta: number; gross: number };
}
function SalesView({ data }: { data: Sales }) {
  return (
    <div className="space-y-4">
      <section className="msh-card overflow-hidden">
        <h2 className="font-semibold p-4">Department sales & ZTA</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th className="p-3">Department</th><th className="p-3">Net</th><th className="p-3">VAT</th><th className="p-3">ZTA</th><th className="p-3">Gross</th></tr></thead>
          <tbody>
            {data.departments?.map((d) => (
              <tr key={d.department} className="border-t"><td className="p-3">{d.department}</td><td className="p-3">${d.net.toFixed(2)}</td><td className="p-3">${d.vat.toFixed(2)}</td><td className="p-3">${d.zta.toFixed(2)}</td><td className="p-3">${d.gross.toFixed(2)}</td></tr>
            ))}
          </tbody>
        </table>
        {data.totals && <p className="p-4 text-sm">Total ${data.totals.gross.toFixed(2)} · VAT ${data.totals.vat.toFixed(2)} · ZTA ${data.totals.zta.toFixed(2)}</p>}
      </section>
      <section className="msh-card overflow-hidden">
        <h2 className="font-semibold p-4">Invoices & individual services</h2>
        {data.invoices?.map((inv, i) => (
          <div key={i} className="border-t p-4 text-sm">
            <div className="font-medium">{inv.guest} · Room {inv.room ?? "—"} · ${inv.gross.toFixed(2)}</div>
            <ul className="mt-1 text-xs text-slate-600">
              {inv.services.map((s, j) => <li key={j}>{s.description} · ${s.gross.toFixed(2)} incl. VAT ${s.vat.toFixed(2)}</li>)}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

interface Zta { levyRatePercent: number; roomNights: number; exclusiveAccommodation: number; levyDue: number; rooms: { date: string; guest: string; room: string; exclusiveAccommodation: number; levy: number }[] }
function ZtaView({ data }: { data: Zta }) {
  return (
    <section className="msh-card overflow-hidden">
      <h2 className="font-semibold p-4">ZTA {data.levyRatePercent}% levy · due ${data.levyDue?.toFixed(2)} · {data.roomNights} room nights</h2>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-slate-500"><th className="p-3">Date</th><th className="p-3">Guest</th><th className="p-3">Room</th><th className="p-3">Exclusive</th><th className="p-3">Levy</th></tr></thead>
        <tbody>
          {data.rooms?.map((r, i) => (
            <tr key={i} className="border-t"><td className="p-3">{r.date}</td><td className="p-3">{r.guest}</td><td className="p-3">{r.room}</td><td className="p-3">${r.exclusiveAccommodation.toFixed(2)}</td><td className="p-3">${r.levy.toFixed(2)}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

interface Covers { periods: { period: string; covers: number; revenue: number }[]; totalCovers: number }
function CoversView({ data }: { data: Covers }) {
  return (
    <div className="grid md:grid-cols-4 gap-4">
      {data.periods?.map((p) => (
        <div key={p.period} className="msh-stat-card">
          <div className="text-xs uppercase">{p.period}</div>
          <div className="text-2xl font-bold">{p.covers}</div>
          <div className="text-sm">${p.revenue.toFixed(2)}</div>
        </div>
      ))}
      <div className="msh-stat-card"><div className="text-xs">TOTAL COVERS</div><div className="text-2xl font-bold">{data.totalCovers}</div></div>
    </div>
  );
}

interface Vat {
  boxes: { box1StandardRatedSuppliesExclVat: number; box2ZeroRatedSupplies: number; box3ExemptSupplies: number; outputVat: number; inputVat: number; vatPayable: number };
  supplier: { name: string; address: string; vatNumber: string | null; bpNumber: string | null };
  taxInvoices: { invoiceNumber: string | null; date: string; customer: string; net: number; vat: number; total: number; lines: { description: string }[] }[];
}
function VatView({ data }: { data: Vat }) {
  return (
    <div className="space-y-4">
      <section className="msh-card p-4 text-sm">
        <h2 className="font-semibold mb-2">ZIMRA VAT return</h2>
        <p>{data.supplier?.name} · {data.supplier?.address}</p>
        <p>VAT {data.supplier?.vatNumber} · BP {data.supplier?.bpNumber}</p>
        <div className="grid md:grid-cols-3 gap-3 mt-3">
          <div>Box 1 standard-rated excl. VAT ${data.boxes?.box1StandardRatedSuppliesExclVat.toFixed(2)}</div>
          <div>Zero-rated ${data.boxes?.box2ZeroRatedSupplies.toFixed(2)}</div>
          <div>Exempt ${data.boxes?.box3ExemptSupplies.toFixed(2)}</div>
          <div>Output VAT ${data.boxes?.outputVat.toFixed(2)}</div>
          <div>Input VAT ${data.boxes?.inputVat.toFixed(2)}</div>
          <div className="font-semibold">VAT payable ${data.boxes?.vatPayable.toFixed(2)}</div>
        </div>
      </section>
      <section className="msh-card overflow-hidden">
        {data.taxInvoices?.map((inv, i) => (
          <div key={i} className="border-t p-4 text-sm">
            <div>{inv.invoiceNumber ?? "Unnumbered"} · {inv.date} · {inv.customer} · ${inv.total.toFixed(2)}</div>
            <div className="text-xs text-slate-500">{inv.lines.map((l) => l.description).join(" · ")}</div>
          </div>
        ))}
      </section>
    </div>
  );
}

interface ResRpt { items: { reservationNumber: string; guest: string; status: string; services: { type: string; description: string; amount: number }[] }[] }
function ResView({ data }: { data: ResRpt }) {
  return (
    <section className="msh-card overflow-hidden">
      {data.items?.map((r) => (
        <div key={r.reservationNumber} className="border-t p-4 text-sm">
          <div className="font-medium">{r.reservationNumber} · {r.guest} · {r.status}</div>
          <ul className="text-xs mt-1">
            {r.services.map((s, i) => <li key={i}>{s.type}: {s.description} · ${s.amount.toFixed(2)}</li>)}
            {r.services.length === 0 && <li>No extra services</li>}
          </ul>
        </div>
      ))}
    </section>
  );
}
