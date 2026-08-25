"use client";

import { Suspense } from "react";
import { GuestAuthForm } from "@/components/portal/GuestAuthForm";

export default function GuestLoginPage() {
  return (
    <Suspense fallback={<div className="guest-shell min-h-screen bg-background" />}>
      <GuestAuthForm />
    </Suspense>
  );
}
