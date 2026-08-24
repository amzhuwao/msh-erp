"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken, getStoredUser } from "@/lib/api";
import { useEffect, useState } from "react";

const nav = [
  { href: "/dashboard", label: "Front Office", icon: "🏨" },
  { href: "/dashboard/groups", label: "Groups", icon: "👥" },
  { href: "/dashboard/housekeeping", label: "Housekeeping", icon: "🛏️" },
  { href: "/dashboard/pos", label: "Restaurant POS", icon: "🍽️" },
  { href: "/dashboard/conference", label: "Conference", icon: "🎤" },
  { href: "/dashboard/services", label: "Guest Services", icon: "🛎️" },
  { href: "/dashboard/maintenance", label: "Maintenance", icon: "🔧" },
  { href: "/dashboard/inventory", label: "Inventory", icon: "📦" },
  { href: "/dashboard/procurement", label: "Procurement", icon: "🧾" },
  { href: "/dashboard/corporate", label: "Corporate", icon: "🏢" },
  { href: "/dashboard/crm", label: "Sales & CRM", icon: "📈" },
  { href: "/dashboard/revenue", label: "Revenue", icon: "💹" },
  { href: "/dashboard/finance", label: "Finance", icon: "📊" },
  { href: "/dashboard/reports", label: "Reports", icon: "📋" },
  { href: "/dashboard/night-audit", label: "Night Audit", icon: "🌙" },
  { href: "/dashboard/notifications", label: "Notifications", icon: "✉️" },
  { href: "/dashboard/settings", label: "Property", icon: "⚙️" },
  { href: "/dashboard/integrations", label: "Integrations", icon: "🔌" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(getStoredUser());

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  if (!user) return null;

  return (
    <div className="min-h-screen flex bg-[hsl(var(--background))]">
      <aside
        className="w-64 shrink-0 flex flex-col text-[hsl(var(--sidebar-foreground))]"
        style={{ background: "hsl(var(--sidebar))" }}
      >
        <div className="px-5 py-5 border-b border-[hsl(var(--sidebar-border))]">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Manica Skyview"
              width={40}
              height={40}
              className="rounded-full ring-1 ring-[hsl(var(--accent)/0.4)]"
            />
            <div>
              <div className="text-[hsl(var(--accent))] text-[10px] font-semibold tracking-[0.2em] uppercase">
                Manica Skyview
              </div>
              <div className="text-[hsl(var(--primary-foreground))] text-sm font-medium" style={{ fontFamily: "Playfair Display, Georgia, serif" }}>
                Administration
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`msh-sidebar-link ${active ? "msh-sidebar-link-active" : ""}`}
              >
                <span className="text-base opacity-80">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-[hsl(var(--sidebar-border))] text-sm">
          <div className="text-[hsl(var(--primary-foreground))] font-medium truncate">{user.fullName}</div>
          <div className="text-[hsl(var(--sidebar-foreground))] text-xs mt-0.5 opacity-80">{user.roleName}</div>
          <button
            onClick={() => {
              clearToken();
              router.push("/login");
            }}
            className="mt-3 text-xs text-[hsl(var(--sidebar-foreground))] hover:text-[hsl(var(--accent))] transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto min-h-screen">
        <div className="border-b border-[hsl(var(--border))] bg-white/80 backdrop-blur-sm sticky top-0 z-10 px-6 py-3">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            Manica Skyview Hotel · Mutare, Zimbabwe
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
