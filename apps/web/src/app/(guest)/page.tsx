"use client";

import { Suspense, useEffect, useState } from "react";
import { GuestAuthForm } from "@/components/portal/GuestAuthForm";
import { getStoredGuest } from "@/lib/guest-api";
import { GuestLanding } from "@/components/portal/GuestLanding";

function HomeSwitch() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(Boolean(getStoredGuest()));
  }, []);

  if (signedIn) return <GuestLanding />;
  return <GuestAuthForm next="/" />;
}

export default function GuestHomePage() {
  return (
    <Suspense fallback={<div className="guest-shell min-h-screen bg-background" />}>
      <HomeSwitch />
    </Suspense>
  );
}
