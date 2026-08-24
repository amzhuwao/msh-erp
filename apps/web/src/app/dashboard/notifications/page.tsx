"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Template { id: string; name: string; channel: string; bodyPattern: string }
interface QueueItem { id: string; recipientContact: string; channel: string; status: string; subject: string | null; body: string }

export default function NotificationsPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [form, setForm] = useState({ recipientContact: "", channel: "EMAIL", templateName: "RESERVATION_CONFIRMATION_EMAIL", GuestName: "Guest", BookingNumber: "MSV-RES-2026-0001" });

  function load() {
    apiFetch<{ items: Template[] }>("/api/notifications/templates").then((d) => setTemplates(d.items));
    apiFetch<{ items: QueueItem[] }>("/api/notifications/queue").then((d) => setQueue(d.items));
  }
  useEffect(() => { load(); }, []);

  async function send() {
    await apiFetch("/api/notifications/send-direct", {
      method: "POST",
      body: JSON.stringify({
        recipientContact: form.recipientContact,
        channel: form.channel,
        templateName: form.templateName,
        transactional: true,
        variables: { GuestName: form.GuestName, BookingNumber: form.BookingNumber },
      }),
    });
    load();
  }

  return (
    <div className="p-6">
      <PageHeader title="Notifications" description="Templates, dispatch queue, and consent-aware messaging" />
      <section className="msh-card p-4 mb-6">
        <h2 className="font-semibold mb-3">Send message</h2>
        <div className="grid md:grid-cols-4 gap-2">
          <input className="msh-input" placeholder="Recipient" value={form.recipientContact} onChange={(e) => setForm({ ...form, recipientContact: e.target.value })} />
          <select className="msh-input" value={form.templateName} onChange={(e) => setForm({ ...form, templateName: e.target.value })}>
            {templates.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
          <select className="msh-input" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
            <option>EMAIL</option><option>SMS</option><option>IN_APP</option>
          </select>
          <button className="msh-btn msh-btn-primary" onClick={send}>Queue / send</button>
        </div>
      </section>
      <section className="msh-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[hsl(var(--muted))] text-left text-[hsl(var(--muted-foreground))]">
            <tr><th className="p-3">To</th><th className="p-3">Channel</th><th className="p-3">Status</th><th className="p-3">Body</th></tr>
          </thead>
          <tbody>
            {queue.map((q) => (
              <tr key={q.id} className="border-t">
                <td className="p-3">{q.recipientContact}</td>
                <td className="p-3">{q.channel}</td>
                <td className="p-3">{q.status}</td>
                <td className="p-3 text-xs truncate max-w-sm">{q.body}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
