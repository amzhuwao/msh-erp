"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(username, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[hsl(var(--background))]">
      <div className="w-full max-w-md animate-[fade-in_0.4s_ease-out]">
        <div className="msh-card overflow-hidden shadow-lg">
          <div className="px-8 pt-10 pb-6 text-center border-b border-[hsl(var(--border))]">
            <div className="flex justify-center mb-4">
              <Image
                src="/logo.png"
                alt="Manica Skyview Hotel"
                width={72}
                height={72}
                className="rounded-full ring-2 ring-[hsl(var(--accent)/0.3)]"
                priority
              />
            </div>
            <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Staff Login</h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              Manica Skyview Hotel — Administration
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            {error && (
              <div className="bg-red-50 text-[hsl(var(--destructive))] text-sm px-4 py-3 rounded-[var(--radius)] border border-red-200">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1.5">
                Staff Email or Username
              </label>
              <input
                className="msh-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="admin or admin@manicaskyview.co.zw"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1.5">
                Password
              </label>
              <input
                type="password"
                className="msh-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <button type="submit" disabled={loading} className="msh-btn msh-btn-primary w-full py-3">
              {loading ? "Signing in…" : "Staff Login"}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-sm text-[hsl(var(--muted-foreground))]">
          <Link href="/book" className="hover:text-[hsl(var(--accent))] transition-colors mr-4">Book online</Link>
          <Link
            href="https://manicaskyview.co.zw/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[hsl(var(--accent))] transition-colors"
          >
            ← Back to Hotel Website
          </Link>
        </p>
      </div>
    </div>
  );
}
