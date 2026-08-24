"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { IconEye, IconEyeOff } from "@/components/portal/Icons";
import { guestLogin, guestSignup } from "@/lib/guest-api";
import { HOTEL_WEBSITE, portalAsset } from "@/lib/portal";

function GuestLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [signup, setSignup] = useState(params.get("signup") === "true");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (signup) await guestSignup(fullName, email, password);
      else await guestLogin(email, password);
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center bg-white px-10 rounded-2xl mb-4">
            <img src={portalAsset("/portal/logo.jpg")} alt="Logo" className="h-32 w-32 rounded-xl object-contain" />
          </div>
          <h1 className="text-3xl font-display font-bold text-foreground">Manica Skyview Hotel</h1>
          <h2 className="text-2xl text-muted-foreground mt-1">Guest Portal</h2>
        </div>

        <div className="rounded-lg border bg-card text-card-foreground shadow-lg">
          <div className="p-6">
            {error && (
              <div className="mb-4 bg-red-50 text-destructive text-sm px-4 py-3 rounded-md border border-red-200">
                {error}
              </div>
            )}
            {signup ? (
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Full Name</label>
                  <input className="msh-input" placeholder="John Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Email</label>
                  <input className="msh-input" type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Password</label>
                  <input className="msh-input" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                </div>
                <button type="submit" className="msh-btn msh-btn-primary w-full py-3" disabled={loading}>
                  {loading ? "Creating..." : "Create Account"}
                </button>
                <p className="text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <button type="button" className="text-primary font-medium hover:underline" onClick={() => setSignup(false)}>
                    Sign In
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Email</label>
                  <input className="msh-input" type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      className="msh-input pr-10"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword((v) => !v)}>
                      {showPassword ? <IconEyeOff /> : <IconEye />}
                    </button>
                  </div>
                </div>
                <button type="submit" className="msh-btn msh-btn-primary w-full py-3" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                </button>
                <p className="text-center text-sm text-muted-foreground">
                  Don&apos;t have an account?{" "}
                  <button type="button" className="text-primary font-medium hover:underline" onClick={() => setSignup(true)}>
                    Sign Up
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>

        <div className="mt-4 text-center space-y-2">
          <a href={HOTEL_WEBSITE} className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to Hotel Website
          </a>
          <Link href="/login" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
            Staff Portal →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function GuestLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <GuestLoginForm />
    </Suspense>
  );
}
