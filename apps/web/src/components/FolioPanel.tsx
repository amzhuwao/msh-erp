"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface FolioLine {
  id: string;
  lineType: string;
  description: string;
  amount: string;
  netAmount?: string;
  vatAmount?: string;
  levyAmount?: string;
  department?: string | null;
  paymentMethod?: string | null;
  createdAt: string;
}

interface Folio {
  id: string;
  balance: number;
  taxSummary?: { net: number; vat: number; levy: number; gross: number };
  lines: FolioLine[];
  guest: { firstName: string; lastName: string };
  reservation: { room: { number: string } | null };
}

interface PayInfo {
  bankTransfer: { bankName: string | null; accountName: string | null; accountNumber: string | null; branch: string | null; swiftCode: string | null };
  ecocash: { number: string | null; merchant: string | null };
  onemoney: { number: string | null };
}

export function FolioPanel({ folioId, onClose }: { folioId: string; onClose: () => void }) {
  const [folio, setFolio] = useState<Folio | null>(null);
  const [chargeDesc, setChargeDesc] = useState("");
  const [chargeAmt, setChargeAmt] = useState("");
  const [payDesc, setPayDesc] = useState("Cash payment");
  const [payAmt, setPayAmt] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [payInfo, setPayInfo] = useState<PayInfo | null>(null);

  function load() {
    apiFetch<Folio>(`/api/folios/${folioId}`).then(setFolio).catch(console.error);
  }

  useEffect(() => {
    load();
    apiFetch<PayInfo>("/api/property/payment-instructions").then(setPayInfo).catch(() => undefined);
  }, [folioId]);

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
      body: JSON.stringify({ description: payDesc, amount: Number(payAmt), paymentMethod: payMethod }),
    });
    setPayAmt(""); load();
  }

  function openDoc(kind: "invoice" | "receipt" | "quote") {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    window.open(`${base}/dashboard/documents/${folioId}?type=${kind}`, "_blank");
  }

  if (!folio) return <div className="p-8 text-slate-500">Loading folio…</div>;

  const charges = folio.lines.filter((l) => l.lineType !== "PAYMENT");
  const payments = folio.lines.filter((l) => l.lineType === "PAYMENT");
  const showBank = payMethod === "BANK_TRANSFER" || payMethod === "ECOCASH" || payMethod === "ONEMONEY";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-[hsl(var(--primary))]">
            Folio — {folio.guest.firstName} {folio.guest.lastName}
          </h2>
          <p className="text-sm text-slate-500">Room {folio.reservation.room?.number ?? "—"}</p>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${folio.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
            ${folio.balance.toFixed(2)}
          </div>
          <div className="flex gap-2 justify-end mt-2">
            <button className="text-xs text-[hsl(var(--accent))]" onClick={() => openDoc("quote")}>Quote</button>
            <button className="text-xs text-[hsl(var(--accent))]" onClick={() => openDoc("invoice")}>Tax invoice</button>
            <button className="text-xs text-[hsl(var(--accent))]" onClick={() => openDoc("receipt")}>Receipt</button>
          </div>
          <button onClick={onClose} className="text-sm text-slate-400 hover:text-slate-600 mt-1">← Back</button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-medium text-sm text-slate-600 mb-2">Charges (VAT shown)</h3>
          <div className="space-y-1 mb-3">
            {charges.map((l) => (
              <div key={l.id} className="text-sm border-b border-[hsl(var(--border))] py-1.5">
                <div className="flex justify-between">
                  <span>{l.description}</span>
                  <span>${Number(l.amount).toFixed(2)}</span>
                </div>
                <div className="text-xs text-slate-400">
                  Net ${Number(l.netAmount ?? 0).toFixed(2)} · VAT ${Number(l.vatAmount ?? 0).toFixed(2)}
                  {Number(l.levyAmount ?? 0) > 0 ? ` · ZTA $${Number(l.levyAmount).toFixed(2)}` : ""}
                </div>
              </div>
            ))}
          </div>
          {folio.taxSummary && (
            <div className="text-xs mb-3 space-y-0.5">
              <div className="flex justify-between"><span>Net</span><span>${folio.taxSummary.net.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>VAT 15%</span><span>${folio.taxSummary.vat.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>ZTA 2%</span><span>${folio.taxSummary.levy.toFixed(2)}</span></div>
            </div>
          )}
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
              <div key={l.id} className="flex justify-between text-sm border-b border-[hsl(var(--border))] py-1.5">
                <span>{l.description}{l.paymentMethod ? ` · ${l.paymentMethod}` : ""}</span>
                <span className="text-emerald-600">-${Number(l.amount).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <select className="border rounded px-2 py-1 text-xs w-full mb-2" value={payMethod} onChange={(e) => {
            setPayMethod(e.target.value);
            setPayDesc(`${e.target.value.replace("_", " ")} payment`);
          }}>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="ECOCASH">EcoCash</option>
            <option value="ONEMONEY">NetOne OneMoney</option>
          </select>
          {showBank && payInfo && (
            <div className="text-xs bg-amber-50 border border-amber-100 rounded p-2 mb-2 space-y-1">
              {payMethod === "BANK_TRANSFER" && (
                <>
                  <div>{payInfo.bankTransfer.bankName} · {payInfo.bankTransfer.branch}</div>
                  <div>{payInfo.bankTransfer.accountName} · {payInfo.bankTransfer.accountNumber}</div>
                  <div>SWIFT {payInfo.bankTransfer.swiftCode}</div>
                </>
              )}
              {payMethod === "ECOCASH" && <div>EcoCash {payInfo.ecocash.number} · Merchant {payInfo.ecocash.merchant}</div>}
              {payMethod === "ONEMONEY" && <div>NetOne / OneMoney {payInfo.onemoney.number}</div>}
            </div>
          )}
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
