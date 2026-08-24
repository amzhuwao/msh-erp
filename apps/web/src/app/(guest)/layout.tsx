import type { Metadata } from "next";
import { PortalChrome } from "@/components/portal/PortalChrome";

export const metadata: Metadata = {
  title: "Manica Skyview Hotel | Guest Portal",
  description: "Book a room, manage reservations, and view billing at Manica Skyview Hotel.",
};

export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return <PortalChrome>{children}</PortalChrome>;
}
