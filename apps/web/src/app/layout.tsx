import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manica Skyview Hotel",
  description: "Manica Skyview Hotel — Guest portal and staff administration",
  themeColor: "#800000",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
