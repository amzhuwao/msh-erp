"use client";

import { Suspense, useEffect, useState } from "react";
import { GuestAuthForm } from "@/components/portal/GuestAuthForm";
import { getStoredGuest } from "@/lib/guest-api";
import { GuestLanding } from "@/components/portal/GuestLanding";

function HomeSwitch() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(Boolean(getStoredGuest()));
    setReady(true);
  }, []);

  if (!ready) return <div className="guest-shell min-h-screen bg-background" />;
  if (!signedIn) return <GuestAuthForm next="/" />;
  return <GuestLanding />;
}

export default function GuestHomePage() {
  return (
    <Suspense fallback={<div className="guest-shell min-h-screen bg-background" />}>
      <HomeSwitch />
    </Suspense>
  );
}
