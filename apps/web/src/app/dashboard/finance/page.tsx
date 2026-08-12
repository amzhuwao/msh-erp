"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Account {
  accountCode: string;
  accountName: string;
  accountType: string;
  balance?: number;
}

interface TrialBalance {
  asOf: string;
  accounts: Account[];
  totalDebits: number;
  totalCredits: number;
}

interface ProfitAndLoss {
  fromDate: string;
  toDate: string;
  revenue: { code: string; name: string; net: number }[];
  expenses: { code: string; name: string; net: number }[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

interface JournalEntry {
  id: string;
  entryNumber: string;
  transactionDate: string;
  description: string;
  referenceDocument: string | null;
  lines: { debitAmount: string; creditAmount: string; account: { accountCode: string; accountName: string } }[];
}

export default function FinancePage() {
  const [coa, setCoa] = useState<Account[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalance | null>(null);
  const [pnl, setPnl] = useState<ProfitAndLoss | null>(null);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [tab, setTab] = useState<"coa" | "trial" | "pnl" | "journals">("trial");

  function load() {
    apiFetch<{ items: Account[] }>("/api/finance/coa").then((d) => setCoa(d.items));
    apiFetch<TrialBalance>("/api/finance/reports/trial-balance").then(setTrialBalance);
    apiFetch<ProfitAndLoss>("/api/finance/reports/profit-and-loss").then(setPnl);
    apiFetch<{ items: JournalEntry[] }>("/api/finance/journals").then((d) => setJournals(d.items));
  }

  useEffect(() => {
    load();
  }, []);

  const tabs = [
    { id: "trial" as const, label: "Trial Balance" },
    { id: "pnl" as const, label: "Profit & Loss" },
    { id: "coa" as const, label: "Chart of Accounts" },
    { id: "journals" as const, label: "Journal Entries" },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-[#0f2744] mb-1">Finance & Accounting</h1>
      <p className="text-slate-500 text-sm mb-6">General ledger, trial balance, and financial reports</p>

      {pnl && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-400 uppercase">Revenue YTD</div>
            <div className="text-2xl font-semibold text-emerald-600">${pnl.totalRevenue.toFixed(2)}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-400 uppercase">Expenses YTD</div>
            <div className="text-2xl font-semibold text-red-600">${pnl.totalExpenses.toFixed(2)}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-400 uppercase">Net Income</div>
            <div className={`text-2xl font-semibold ${pnl.netIncome >= 0 ? "text-[#0f2744]" : "text-red-600"}`}>
              ${pnl.netIncome.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm ${
              tab === t.id ? "bg-[#0f2744] text-white" : "bg-white border border-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "trial" && trialBalance && (
        <section className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-semibold text-[#0f2744] mb-3">Trial Balance — {trialBalance.asOf}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b">
                <th className="pb-2">Code</th>
                <th className="pb-2">Account</th>
                <th className="pb-2">Type</th>
                <th className="pb-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {trialBalance.accounts.map((a) => (
                <tr key={a.accountCode} className="border-b border-slate-50">
                  <td className="py-2 font-mono text-xs">{a.accountCode}</td>
                  <td className="py-2">{a.accountName}</td>
                  <td className="py-2 text-slate-400">{a.accountType}</td>
                  <td className="py-2 text-right">${a.balance!.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === "pnl" && pnl && (
        <section className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-semibold text-[#0f2744] mb-3">
            Profit & Loss — {pnl.fromDate} to {pnl.toDate}
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-emerald-700 mb-2">Revenue</h3>
              <ul className="space-y-1 text-sm">
                {pnl.revenue.map((r) => (
                  <li key={r.code} className="flex justify-between">
                    <span>{r.name}</span>
                    <span>${r.net.toFixed(2)}</span>
                  </li>
                ))}
                {pnl.revenue.length === 0 && <li className="text-slate-400">No revenue postings yet.</li>}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-medium text-red-700 mb-2">Expenses</h3>
              <ul className="space-y-1 text-sm">
                {pnl.expenses.map((e) => (
                  <li key={e.code} className="flex justify-between">
                    <span>{e.name}</span>
                    <span>${Math.abs(e.net).toFixed(2)}</span>
                  </li>
                ))}
                {pnl.expenses.length === 0 && <li className="text-slate-400">No expense postings yet.</li>}
              </ul>
            </div>
          </div>
        </section>
      )}

      {tab === "coa" && (
        <section className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-semibold text-[#0f2744] mb-3">Chart of Accounts</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b">
                <th className="pb-2">Code</th>
                <th className="pb-2">Name</th>
                <th className="pb-2">Type</th>
              </tr>
            </thead>
            <tbody>
              {coa.map((a) => (
                <tr key={a.accountCode} className="border-b border-slate-50">
                  <td className="py-2 font-mono text-xs">{a.accountCode}</td>
                  <td className="py-2">{a.accountName}</td>
                  <td className="py-2 text-slate-400">{a.accountType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === "journals" && (
        <section className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-semibold text-[#0f2744] mb-3">Recent Journal Entries</h2>
          <ul className="space-y-4">
            {journals.map((j) => (
              <li key={j.id} className="border border-slate-100 rounded-lg p-3">
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-mono text-[#4a90a4]">{j.entryNumber}</span>
                  <span className="text-slate-400">{j.transactionDate.slice(0, 10)}</span>
                </div>
                <p className="text-sm mb-2">{j.description}</p>
                <ul className="text-xs text-slate-500 space-y-0.5">
                  {j.lines.map((line, i) => (
                    <li key={i}>
                      {line.account.accountCode} {line.account.accountName}
                      {Number(line.debitAmount) > 0 && ` — Dr $${Number(line.debitAmount).toFixed(2)}`}
                      {Number(line.creditAmount) > 0 && ` — Cr $${Number(line.creditAmount).toFixed(2)}`}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {journals.length === 0 && <li className="text-slate-400 text-sm">No journal entries yet.</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
