"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconBed,
  IconCalendar,
  IconHome,
  IconMail,
  IconPhone,
  IconUser,
  IconWallet,
} from "./Icons";
import { HOTEL_EMAIL, HOTEL_PHONE, HOTEL_WEBSITE, portalAsset } from "@/lib/portal";
import { clearGuestSession, getStoredGuest, type GuestProfile } from "@/lib/guest-api";

const nav = [
  { href: "/", label: "Home", shortLabel: "Home", icon: IconHome, end: true },
  { href: "/browse", label: "Book a room", shortLabel: "Book", icon: IconBed },
  { href: "/my-bookings", label: "My bookings", shortLabel: "Bookings", icon: IconCalendar },
  { href: "/my-billing", label: "Billing", shortLabel: "Billing", icon: IconWallet },
  { href: "/my-account", label: "My account", shortLabel: "Account", icon: IconUser },
];

function isActive(pathname: string, href: string, end?: boolean) {
  if (end) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PortalChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [guest, setGuest] = useState<GuestProfile | null>(null);
  const bare = pathname === "/guest/login";

  useEffect(() => {
    setGuest(getStoredGuest());
  }, [pathname]);

  if (bare) return <>{children}</>;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="hidden md:block border-b border-border/70 bg-card/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <img src={portalAsset("/portal/logo.jpg")} alt="" className="h-9 w-9 rounded-xl object-contain ring-1 ring-border/50" />
            <div className="leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Welcome</p>
              <p className="font-display text-sm font-bold truncate">Manica Skyview</p>
            </div>
          </Link>
          <nav className="flex items-center gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  isActive(pathname, item.href, item.end)
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            {guest ? (
              <>
                <span className="text-sm text-muted-foreground hidden lg:inline max-w-[10rem] truncate">{guest.firstName}</span>
                <button
                  type="button"
                  className="h-9 px-3 text-xs font-medium rounded-xl hover:bg-muted"
                  onClick={() => {
                    clearGuestSession();
                    setGuest(null);
                    router.push("/");
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link href="/guest/login" className="h-9 px-3 text-xs font-medium rounded-xl hover:bg-muted inline-flex items-center">
                  Sign in
                </Link>
                <Link href="/guest/login?signup=true" className="h-9 px-3 text-xs font-semibold rounded-xl shadow-sm bg-primary text-primary-foreground inline-flex items-center">
                  Join
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <header className="md:hidden sticky top-0 z-50 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-card/80 px-3 py-2.5 shadow-sm backdrop-blur-md">
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <img src={portalAsset("/portal/logo.jpg")} alt="" className="h-9 w-9 rounded-xl object-contain ring-1 ring-border/50 shrink-0" />
            <div className="min-w-0 leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Welcome</p>
              <p className="font-display text-sm font-bold truncate text-foreground">Manica Skyview</p>
            </div>
          </Link>
          {guest ? (
            <Link href="/my-account" className="h-9 px-3 text-xs font-medium rounded-xl hover:bg-muted inline-flex items-center">
              {guest.firstName}
            </Link>
          ) : (
            <div className="flex items-center gap-1.5 shrink-0">
              <Link href="/guest/login" className="h-9 px-3 text-xs font-medium rounded-xl hover:bg-muted inline-flex items-center">
                Sign in
              </Link>
              <Link href="/guest/login?signup=true" className="h-9 px-3 text-xs font-semibold rounded-xl shadow-sm bg-primary text-primary-foreground inline-flex items-center">
                Join
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>

      <footer className="hidden md:block border-t border-border mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={portalAsset("/portal/logo.jpg")} alt="" className="h-7 w-7 rounded-lg object-contain" />
            <span className="font-display text-sm font-semibold">Manica Skyview Hotel</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <a href={`tel:${HOTEL_PHONE.replace(/\s/g, "")}`} className="flex items-center gap-1.5 hover:text-foreground">
              <IconPhone className="h-4 w-4 text-primary" /> {HOTEL_PHONE}
            </a>
            <a href={`mailto:${HOTEL_EMAIL}`} className="flex items-center gap-1.5 hover:text-foreground">
              <IconMail className="h-4 w-4 text-primary" /> {HOTEL_EMAIL}
            </a>
            <Link href="/login" className="hover:text-foreground transition-colors">Staff Portal →</Link>
          </div>
        </div>
        <p className="text-center text-[11px] text-muted-foreground pb-6">
          © {new Date().getFullYear()} Manica Skyview. All rights reserved.{" "}
          <a href={HOTEL_WEBSITE} className="hover:text-foreground">Hotel website</a>
        </p>
      </footer>

      <nav
        className="md:hidden print:hidden fixed bottom-0 inset-x-0 z-50 border-t bg-card/95 backdrop-blur pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.12)]"
        aria-label="Primary"
      >
        <div className="mx-auto flex h-[3.25rem] max-w-6xl items-stretch px-1">
          {nav.map((item) => {
            const active = isActive(pathname, item.href, item.end);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1 text-[10px] font-medium ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.shortLabel}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
