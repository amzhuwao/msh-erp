"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getGuestToken } from "@/lib/guest-api";

export function GuestGate({ children, next }: { children: React.ReactNode; next: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getGuestToken()) {
      router.replace(`/guest/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setReady(true);
  }, [next, router]);

  if (!ready) {
    return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  }
  return <>{children}</>;
}
