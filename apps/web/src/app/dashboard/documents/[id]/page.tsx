"use client";

import Image from "next/image";
import { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface Doc {
  documentTitle: string;
  documentNumber: string | null;
  issuedAt: string;
  property: {
    name: string;
    address: string;
    vatNumber: string | null;
    tinNumber?: string | null;
    bpNumber: string | null;
    ztaLevyRatePercent?: number;
    phone: string | null;
    netoneNumber: string | null;
    whatsappNumber: string | null;
    email: string | null;
  };
  guest: {
    name: string;
    email: string | null;
    phone?: string | null;
    address?: string | null;
    nationality: string | null;
    nationalId: string | null;
    organization?: string | null;
  };
  stay: { room: string | null; roomType: string; checkIn?: string | null; checkOut?: string | null; eventStart?: string | null; eventEnd?: string | null };
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

function amount(value: number) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function formattedDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function DocumentInner() {
  const params = useSearchParams();
  const route = useParams<{ id: string }>();
  const requestedType = params.get("type");
  const type = requestedType === "receipt" || requestedType === "quote" || requestedType === "proforma"
    ? requestedType
    : "invoice";
  const source = params.get("source") ?? "folio";
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState("");
  const folioId = route.id;

  useEffect(() => {
    if (!folioId) return;
    const endpoint = type === "proforma"
      ? source === "conference"
        ? `/api/conference/bookings/${folioId}/proforma`
        : source === "reservation"
          ? `/api/reservations/${folioId}/proforma`
          : `/api/folios/${folioId}/proforma`
      : `/api/folios/${folioId}/${type}`;
    apiFetch<Doc>(endpoint).then(setDoc).catch((err) => setError(err instanceof Error ? err.message : "Could not load this document"));
  }, [folioId, source, type]);

  if (error) return <div className="mx-auto max-w-4xl p-8 text-sm text-red-700">{error}</div>;
  if (!doc) return <div className="p-10">Loading document…</div>;

  const invoiceTotal = doc.taxSummary.net + doc.taxSummary.vat + doc.taxSummary.levy;
  const amountPaid = doc.payments.reduce((total, payment) => total + Number(payment.amount), 0);
  const balanceDue = Math.max(0, invoiceTotal - amountPaid);
  const isTaxInvoice = doc.documentTitle === "TAX INVOICE";
  const customerName = doc.guest.organization || doc.guest.name;
  const totalLabel = isTaxInvoice ? "Invoice total USD" : doc.documentTitle === "RECEIPT" ? "Receipt total USD" : doc.documentTitle === "QUOTATION" ? "Quote total USD" : "Estimated total USD";
  const detailRows = [
    { label: "Customer address", value: doc.guest.address },
    { label: "Customer VAT", value: null },
    { label: "Customer TIN", value: null },
    { label: "Customer email", value: doc.guest.email },
    { label: "Customer contact", value: doc.guest.phone },
  ];
  const levyRate = Number(doc.property.ztaLevyRatePercent ?? 2);
  const hasLevy = doc.taxSummary.levy > 0;
  const banking = doc.paymentInstructions.bankTransfer;
  const otherBanking = [
    doc.paymentInstructions.ecocash.number ? `EcoCash ${doc.paymentInstructions.ecocash.number}${doc.paymentInstructions.ecocash.merchant ? ` · Merchant ${doc.paymentInstructions.ecocash.merchant}` : ""}` : "",
    doc.paymentInstructions.onemoney.number ? `OneMoney / NetOne ${doc.paymentInstructions.onemoney.number}` : "",
  ].filter(Boolean);

  return (
    <div className="min-h-full bg-slate-100 px-4 py-8 print:min-h-0 print:bg-white print:p-0">
      <article className="invoice-sheet mx-auto max-w-4xl border border-slate-400 bg-white p-6 text-[11px] leading-snug text-slate-950 shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <header className="grid grid-cols-[1.15fr_0.85fr] border border-slate-700">
          <div className="flex min-h-32 items-center justify-center border-r border-slate-700 p-5">
            <div className="flex items-center gap-4">
              <Image src="/logo.png" alt="Manica Skyview Hotel" width={86} height={86} className="h-[76px] w-[76px] object-contain" />
              <div>
                <h1 className="font-serif text-xl font-bold uppercase tracking-wide">{doc.property.name}</h1>
                <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-600">Hotel</p>
              </div>
            </div>
          </div>
          <div>
            <h2 className="border-b border-slate-700 px-3 py-2 text-center text-xs font-bold uppercase tracking-wide">
              {isTaxInvoice ? "Fiscal Tax Invoice — Cash Sale" : doc.documentTitle}
            </h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 p-3 text-[10px]">
              <dt className="font-semibold">Date</dt><dd>{formattedDate(doc.issuedAt)}</dd>
              <dt className="font-semibold">Sales person</dt><dd>—</dd>
              <dt className="font-semibold">Reference number</dt><dd>{doc.documentNumber || "—"}</dd>
              <dt className="font-semibold">Our VAT no</dt><dd>{doc.property.vatNumber || "—"}</dd>
              <dt className="font-semibold">Our TIN no</dt><dd>{doc.property.tinNumber || "—"}</dd>
              <dt className="font-semibold">Address</dt><dd>{doc.property.address}</dd>
              <dt className="font-semibold">Email address</dt><dd>{doc.property.email || "—"}</dd>
              <dt className="font-semibold">Contact number</dt><dd>{doc.property.phone || doc.property.whatsappNumber || "—"}</dd>
            </dl>
          </div>
        </header>

        <section className="relative mt-2 border border-slate-700 px-3 py-3">
          <div className="grid grid-cols-[1fr_1fr] gap-x-6 gap-y-1 pr-28 text-[10px]">
            <p><span className="mr-2 inline-block min-w-28 font-semibold uppercase">Customer name</span>{customerName}</p>
            {doc.guest.organization && <p><span className="mr-2 font-semibold uppercase">Attn:</span>{doc.guest.name}</p>}
            {detailRows.map((row) => (
              <p key={row.label}>
                <span className="mr-2 inline-block min-w-28 font-semibold uppercase">{row.label}</span>
                {row.value || ""}
              </p>
            ))}
            <p className="col-span-2 mt-2 border-t border-slate-300 pt-2 text-right font-semibold uppercase">Date: {formattedDate(doc.stay.eventStart ?? doc.stay.checkIn ?? doc.issuedAt)}</p>
            {doc.stay.room && <p><span className="font-semibold uppercase">Room:</span> {doc.stay.room} · {doc.stay.roomType}</p>}
            {doc.stay.checkIn && <p><span className="font-semibold uppercase">Stay:</span> {formattedDate(doc.stay.checkIn)} – {formattedDate(doc.stay.checkOut)}</p>}
            {doc.stay.eventStart && <p><span className="font-semibold uppercase">Event:</span> {formattedDate(doc.stay.eventStart)}{doc.stay.eventEnd ? ` – ${formattedDate(doc.stay.eventEnd)}` : ""}</p>}
          </div>
        </section>

        <div className="mt-4 overflow-hidden">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="border-y border-slate-700 text-left uppercase">
                <th className="px-1.5 py-2">#</th>
                <th className="px-1.5 py-2 text-right">Qty</th>
                <th className="px-1.5 py-2">HS code</th>
                <th className="px-1.5 py-2">Description</th>
                <th className="px-1.5 py-2 text-right">Unit price</th>
                <th className="px-1.5 py-2 text-right">VAT amt</th>
                <th className="px-1.5 py-2 text-right">Total (excl)</th>
                <th className="px-1.5 py-2 text-right">Total (incl)</th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((line, index) => (
                <tr key={`${line.description}-${index}`} className="border-b border-slate-300 align-top">
                  <td className="px-1.5 py-2">{index + 1}</td>
                  <td className="px-1.5 py-2 text-right">1</td>
                  <td className="px-1.5 py-2">—</td>
                  <td className="px-1.5 py-2">{line.description}</td>
                  <td className="px-1.5 py-2 text-right">{amount(line.net)}</td>
                  <td className="px-1.5 py-2 text-right">{amount(line.vat)}</td>
                  <td className="px-1.5 py-2 text-right">{amount(line.net)}</td>
                  <td className="px-1.5 py-2 text-right">{amount(line.net + line.vat)}</td>
                </tr>
              ))}
              {hasLevy && (
                <tr className="border-b border-slate-300">
                  <td className="px-1.5 py-2">{doc.lines.length + 1}</td>
                  <td className="px-1.5 py-2 text-right">1</td>
                  <td className="px-1.5 py-2">—</td>
                  <td className="px-1.5 py-2">ZTA levy {levyRate}%</td>
                  <td className="px-1.5 py-2 text-right">{amount(doc.taxSummary.levy)}</td>
                  <td className="px-1.5 py-2 text-right">{amount(0)}</td>
                  <td className="px-1.5 py-2 text-right">{amount(doc.taxSummary.levy)}</td>
                  <td className="px-1.5 py-2 text-right">{amount(doc.taxSummary.levy)}</td>
                </tr>
              )}
              {doc.lines.length === 0 && !hasLevy && <tr><td colSpan={8} className="py-6 text-center text-slate-500">No charge lines on this document.</td></tr>}
            </tbody>
          </table>
        </div>

        <section className="mt-3 grid grid-cols-[1fr_0.92fr] items-start gap-4">
          <div className="border border-slate-700 p-3 text-[10px]">
            <h2 className="font-bold uppercase">Banking details · USD (Nostro)</h2>
            <p className="mt-2"><span className="font-semibold uppercase">Account name:</span> {banking.accountName || doc.property.name}</p>
            <p><span className="font-semibold uppercase">Branch:</span> {banking.branch || "—"}</p>
            <p><span className="font-semibold uppercase">Account number:</span> {banking.accountNumber || "—"}</p>
            {banking.bankName && <p><span className="font-semibold uppercase">Bank:</span> {banking.bankName}</p>}
            {banking.swiftCode && <p><span className="font-semibold uppercase">SWIFT:</span> {banking.swiftCode}</p>}
            {otherBanking.map((detail) => <p key={detail}>{detail}</p>)}
          </div>
          <dl className="border border-slate-700 text-[10px]">
            <div className="flex justify-between border-b border-slate-500 px-3 py-2"><dt className="font-semibold uppercase">Sub total excl USD</dt><dd>{amount(doc.taxSummary.net)}</dd></div>
            <div className="flex justify-between border-b border-slate-500 px-3 py-2"><dt className="font-semibold uppercase">VAT total</dt><dd>{amount(doc.taxSummary.vat)}</dd></div>
            <div className="flex justify-between border-b border-slate-500 px-3 py-2"><dt className="font-semibold uppercase">ZTA levy {levyRate}%</dt><dd>{amount(doc.taxSummary.levy)}</dd></div>
            <div className="flex justify-between border-b border-slate-500 px-3 py-2 font-bold"><dt className="uppercase">{totalLabel}</dt><dd>{amount(invoiceTotal)}</dd></div>
            <div className="flex justify-between border-b border-slate-500 px-3 py-2"><dt className="font-semibold uppercase">Amount paid USD</dt><dd>{amount(amountPaid)}</dd></div>
            <div className="flex justify-between px-3 py-2 font-bold"><dt className="uppercase">Balance due USD</dt><dd>{amount(balanceDue)}</dd></div>
          </dl>
        </section>

        {doc.documentTitle === "PRO FORMA INVOICE" && <p className="mt-4 border border-amber-300 bg-amber-50 p-3 text-[10px] text-amber-950 print:bg-white">This is a pro forma estimate, not a tax invoice. Final charges may change with actual services and usage.</p>}
        {doc.services.length > 0 && <p className="mt-3 text-[9px] text-slate-600">Service references: {doc.services.map((service) => `${service.reference} · ${service.description}`).join("; ")}</p>}

        {isTaxInvoice && (
          <footer className="mt-5 flex justify-center">
            <div className="flex h-24 w-24 flex-col items-center justify-center border border-dashed border-slate-400 px-2 text-center text-[8px] uppercase text-slate-500">
              Revmax fiscal QR code<br />added after fiscalization
            </div>
          </footer>
        )}
      </article>
      <div className="mx-auto mt-4 flex max-w-4xl flex-wrap items-center justify-between gap-3 print:hidden">
        {isTaxInvoice && <p className="max-w-xl text-xs text-slate-600">Choose the RevMax printer in the print dialog. RevMax will produce the fiscalized invoice PDF.</p>}
        <div className="ml-auto flex gap-2">
          {isTaxInvoice && <button className="msh-btn msh-btn-primary" onClick={() => window.print()}>Fiscalize with RevMax</button>}
          <button className="msh-btn msh-btn-outline" onClick={() => window.print()}>{isTaxInvoice ? "Print invoice" : "Print document"}</button>
        </div>
      </div>
      <style jsx global>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          html, body { background: #fff !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body * { visibility: hidden !important; }
          .invoice-sheet, .invoice-sheet * { visibility: visible !important; }
          .invoice-sheet {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            break-inside: avoid;
          }
        }
      `}</style>
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
