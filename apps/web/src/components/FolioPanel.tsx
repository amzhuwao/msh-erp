"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface FolioLine {
  id: string;
  lineType: string;
  description: string;
  amount: string;
  createdAt: string;
}

interface Folio {
  id: string;
  balance: number;
  lines: FolioLine[];
  guest: { firstName: string; lastName: string };
  reservation: { room: { number: string } | null };
}

export function FolioPanel({ folioId, onClose }: { folioId: string; onClose: () => void }) {
  const [folio, setFolio] = useState<Folio | null>(null);
  const [chargeDesc, setChargeDesc] = useState("");
  const [chargeAmt, setChargeAmt] = useState("");
  const [payDesc, setPayDesc] = useState("Cash payment");
  const [payAmt, setPayAmt] = useState("");

  function load() {
    apiFetch<Folio>(`/api/folios/${folioId}`).then(setFolio).catch(console.error);
  }

  useEffect(() => { load(); }, [folioId]);

  async function postCharge() {
    await apiFetch(`/api/folios/${folioId}/charges`, {
      method: "POST",
      body: JSON.stringify({ description: chargeDesc, amount: Number(chargeAmt) }),
    });
    setChargeDesc(""); setChargeAmt(""); load();
  }

  async function postPayment() {
    await apiFetch(`/api/folios/${folioId}/payments`, {
      method: "POST",
      body: JSON.stringify({ description: payDesc, amount: Number(payAmt) }),
    });
    setPayAmt(""); load();
  }

  if (!folio) return <div className="p-8 text-slate-500">Loading folio…</div>;

  const charges = folio.lines.filter((l) => l.lineType !== "PAYMENT");
  const payments = folio.lines.filter((l) => l.lineType === "PAYMENT");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0f2744]">
            Folio — {folio.guest.firstName} {folio.guest.lastName}
          </h2>
          <p className="text-sm text-slate-500">Room {folio.reservation.room?.number ?? "—"}</p>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${folio.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
            ${folio.balance.toFixed(2)}
          </div>
          <button onClick={onClose} className="text-sm text-slate-400 hover:text-slate-600 mt-1">← Back</button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-medium text-sm text-slate-600 mb-2">Charges</h3>
          <div className="space-y-1 mb-3">
            {charges.map((l) => (
              <div key={l.id} className="flex justify-between text-sm border-b border-slate-100 py-1.5">
                <span>{l.description}</span>
                <span>${Number(l.amount).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input placeholder="Description" className="border rounded px-2 py-1 text-xs flex-1" value={chargeDesc} onChange={(e) => setChargeDesc(e.target.value)} />
            <input placeholder="Amount" type="number" className="border rounded px-2 py-1 text-xs w-20" value={chargeAmt} onChange={(e) => setChargeAmt(e.target.value)} />
            <button onClick={postCharge} className="bg-slate-700 text-white px-2 py-1 rounded text-xs">Post</button>
          </div>
        </div>
        <div>
          <h3 className="font-medium text-sm text-slate-600 mb-2">Payments</h3>
          <div className="space-y-1 mb-3">
            {payments.map((l) => (
              <div key={l.id} className="flex justify-between text-sm border-b border-slate-100 py-1.5">
                <span>{l.description}</span>
                <span className="text-emerald-600">-${Number(l.amount).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input placeholder="Description" className="border rounded px-2 py-1 text-xs flex-1" value={payDesc} onChange={(e) => setPayDesc(e.target.value)} />
            <input placeholder="Amount" type="number" className="border rounded px-2 py-1 text-xs w-20" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} />
            <button onClick={postPayment} className="bg-emerald-600 text-white px-2 py-1 rounded text-xs">Pay</button>
          </div>
        </div>
      </div>
    </div>
  );
}
