"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface Doc {
  documentTitle: string;
  documentNumber: string | null;
  issuedAt: string;
  property: {
    name: string; address: string; vatNumber: string | null; bpNumber: string | null;
    phone: string | null; netoneNumber: string | null; whatsappNumber: string | null; email: string | null;
  };
  guest: { name: string; email: string; nationality: string | null; nationalId: string | null };
  stay: { room: string | null; roomType: string };
  lines: { description: string; net: number; vat: number; levy: number; gross: number }[];
  payments: { description: string; method: string | null; amount: number }[];
  taxSummary: { net: number; vat: number; levy: number; gross: number };
  balance: number;
  services: { kind: string; reference: string; description: string; amount: number }[];
  paymentInstructions: {
    bankTransfer: { bankName: string | null; branch: string | null; accountName: string | null; accountNumber: string | null; swiftCode: string | null };
    ecocash: { number: string | null; merchant: string | null };
    onemoney: { number: string | null };
  };
}

function DocumentInner() {
  const params = useSearchParams();
  const route = useParams<{ id: string }>();
  const type = (params.get("type") ?? "invoice") as "invoice" | "receipt" | "quote";
  const [doc, setDoc] = useState<Doc | null>(null);
  const folioId = route.id;

  useEffect(() => {
    if (!folioId) return;
    apiFetch<Doc>(`/api/folios/${folioId}/${type}`).then(setDoc).catch(console.error);
  }, [folioId, type]);

  if (!doc) return <div className="p-10">Loading document…</div>;

  return (
    <div className="max-w-3xl mx-auto bg-white p-8 print:p-0">
      <div className="flex justify-between items-start border-b pb-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-[hsl(var(--accent))]">Manica Skyview Hotel</div>
          <h1 className="text-2xl font-bold">{doc.documentTitle}</h1>
          <p className="text-sm">{doc.documentNumber}</p>
        </div>
        <button className="msh-btn msh-btn-outline print:hidden" onClick={() => window.print()}>Print</button>
      </div>
      <div className="grid md:grid-cols-2 gap-4 text-sm mt-4">
        <div>
          <div className="font-semibold">{doc.property.name}</div>
          <div>{doc.property.address}</div>
          <div>Tel {doc.property.phone}</div>
          <div>NetOne {doc.property.netoneNumber}</div>
          <div>WhatsApp {doc.property.whatsappNumber}</div>
          <div>VAT {doc.property.vatNumber} · BP {doc.property.bpNumber}</div>
        </div>
        <div>
          <div className="font-semibold">Bill to</div>
          <div>{doc.guest.name}</div>
          <div>{doc.guest.email}</div>
          <div>{doc.guest.nationality} · ID {doc.guest.nationalId}</div>
          <div>Room {doc.stay.room} · {doc.stay.roomType}</div>
        </div>
      </div>
      <table className="w-full text-sm mt-6">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Description</th>
            <th className="py-2 text-right">Net</th>
            <th className="py-2 text-right">VAT 15%</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l, i) => (
            <tr key={i} className="border-b">
              <td className="py-2">{l.description}</td>
              <td className="py-2 text-right">${l.net.toFixed(2)}</td>
              <td className="py-2 text-right">${l.vat.toFixed(2)}</td>
              <td className="py-2 text-right">${l.gross.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 text-sm max-w-xs ml-auto space-y-1">
        <div className="flex justify-between"><span>Subtotal (excl. VAT)</span><span>${doc.taxSummary.net.toFixed(2)}</span></div>
        <div className="flex justify-between"><span>VAT 15%</span><span>${doc.taxSummary.vat.toFixed(2)}</span></div>
        <div className="flex justify-between"><span>ZTA levy 2%</span><span>${doc.taxSummary.levy.toFixed(2)}</span></div>
        <div className="flex justify-between font-semibold"><span>Total</span><span>${doc.taxSummary.gross.toFixed(2)}</span></div>
        <div className="flex justify-between"><span>Balance</span><span>${doc.balance.toFixed(2)}</span></div>
      </div>
      {doc.services.length > 0 && (
        <div className="mt-6 text-sm">
          <h2 className="font-semibold mb-2">Individual services</h2>
          <ul className="space-y-1">
            {doc.services.map((s) => (
              <li key={s.reference}>{s.kind} · {s.reference} · {s.description} · ${s.amount.toFixed(2)}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-6 text-sm border-t pt-4">
        <h2 className="font-semibold mb-1">Banking / EcoCash / NetOne</h2>
        <p>{doc.paymentInstructions.bankTransfer.bankName} {doc.paymentInstructions.bankTransfer.branch} · {doc.paymentInstructions.bankTransfer.accountName} · {doc.paymentInstructions.bankTransfer.accountNumber} · SWIFT {doc.paymentInstructions.bankTransfer.swiftCode}</p>
        <p>EcoCash {doc.paymentInstructions.ecocash.number} · Merchant {doc.paymentInstructions.ecocash.merchant}</p>
        <p>NetOne / OneMoney {doc.paymentInstructions.onemoney.number}</p>
      </div>
    </div>
  );
}

export default function FolioDocumentPage() {
  return (
    <Suspense fallback={<div className="p-10">Loading…</div>}>
      <DocumentInner />
    </Suspense>
  );
}
