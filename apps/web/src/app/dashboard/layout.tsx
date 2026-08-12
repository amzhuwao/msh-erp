"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken, getStoredUser } from "@/lib/api";
import { useEffect, useState } from "react";

const nav = [
  { href: "/dashboard", label: "Front Office" },
  { href: "/dashboard/housekeeping", label: "Housekeeping" },
  { href: "/dashboard/night-audit", label: "Night Audit" },
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
    <div className="min-h-screen flex">
      <aside className="w-56 bg-[#0f2744] text-white flex flex-col shrink-0">
        <div className="px-5 py-6 border-b border-white/10">
          <div className="text-[#c9a227] text-xs font-semibold tracking-widest uppercase">
            Manica Skyview
          </div>
          <div className="text-lg font-light mt-1">Hotel ERP</div>
        </div>
        <nav className="flex-1 py-4">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-5 py-3 text-sm transition ${
                pathname === item.href
                  ? "bg-white/10 text-[#c9a227] border-r-2 border-[#c9a227]"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/10 text-sm">
          <div className="text-white font-medium truncate">{user.fullName}</div>
          <div className="text-slate-400 text-xs mt-0.5">{user.roleName}</div>
          <button
            onClick={() => {
              clearToken();
              router.push("/login");
            }}
            className="mt-3 text-xs text-slate-400 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
