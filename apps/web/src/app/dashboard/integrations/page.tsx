"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Key { id: string; clientName: string; tokenPrefix: string; isActive: boolean; scopes: string[] }
interface Log { id: string; endpoint: string; httpMethod: string; statusCode: number; responseTimeMs: number; createdAt: string }
interface CreatedKey { token: string; secret: string; clientName: string }

export default function IntegrationsPage() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [ota, setOta] = useState<unknown>(null);

  function load() {
    apiFetch<{ items: Key[] }>("/api/v1/integrations/keys").then((d) => setKeys(d.items));
    apiFetch<{ items: Log[] }>("/api/v1/integrations/logs").then((d) => setLogs(d.items));
  }
  useEffect(() => { load(); }, []);

  async function createKey() {
    const result = await apiFetch<CreatedKey>("/api/v1/integrations/keys", {
      method: "POST",
      body: JSON.stringify({ clientName: "WebBookingEngine", scopes: ["reservations:read", "reservations:create"] }),
    });
    setCreated(result);
    load();
  }

  return (
    <div className="p-6">
      <PageHeader title="API & Integrations" description="API keys, webhooks, OTA sync, payment stubs, and integration logs" />
      <div className="flex gap-2 mb-6">
        <button className="msh-btn msh-btn-primary" onClick={createKey}>Create API key</button>
        <button className="msh-btn msh-btn-outline" onClick={() => apiFetch<unknown>("/api/v1/integrations/ota/sync", { method: "POST" }).then((d) => { setOta(d); load(); })}>OTA sync</button>
      </div>
      {created && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-[var(--radius)] p-3 text-xs">
          Copy now — token <code>{created.token}</code> · secret <code>{created.secret}</code>
        </div>
      )}
      {ota !== null && <pre className="msh-card p-3 text-xs mb-4">{JSON.stringify(ota, null, 2)}</pre>}
      <section className="msh-card overflow-hidden mb-6">
        <h2 className="font-semibold p-4 pb-2">API keys</h2>
        <ul className="text-sm px-4 pb-4 space-y-1">
          {keys.map((k) => <li key={k.id}>{k.clientName} · {k.tokenPrefix}… · {k.isActive ? "active" : "revoked"}</li>)}
          {keys.length === 0 && <li className="text-[hsl(var(--muted-foreground))]">No keys yet</li>}
        </ul>
      </section>
      <section className="msh-card overflow-hidden">
        <h2 className="font-semibold p-4 pb-2">Integration logs</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-[hsl(var(--muted-foreground))]">
            <tr><th className="p-3">When</th><th className="p-3">Method</th><th className="p-3">Endpoint</th><th className="p-3">Status</th><th className="p-3">ms</th></tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="p-3 text-xs">{l.createdAt.slice(0, 19).replace("T", " ")}</td>
                <td className="p-3">{l.httpMethod}</td>
                <td className="p-3 font-mono text-xs">{l.endpoint}</td>
                <td className="p-3">{l.statusCode}</td>
                <td className="p-3">{l.responseTimeMs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
