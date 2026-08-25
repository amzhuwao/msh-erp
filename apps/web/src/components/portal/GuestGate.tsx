"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getGuestToken } from "@/lib/guest-api";

export function GuestGate({ children, next }: { children: React.ReactNode; next?: string }) {
  return (
    <Suspense fallback={<div className="guest-shell p-8 text-center text-muted-foreground">Loading...</div>}>
      <GuestGateInner next={next}>{children}</GuestGateInner>
    </Suspense>
  );
}

function GuestGateInner({ children, next }: { children: React.ReactNode; next?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getGuestToken()) {
      const qs = search.toString();
      const dest = next ?? `${pathname}${qs ? `?${qs}` : ""}`;
      router.replace(`/guest/login?next=${encodeURIComponent(dest)}`);
      return;
    }
    setReady(true);
  }, [next, pathname, router, search]);

  if (!ready) {
    return <div className="guest-shell p-8 text-center text-muted-foreground">Loading...</div>;
  }
  return <>{children}</>;
}
