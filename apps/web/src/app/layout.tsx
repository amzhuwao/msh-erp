import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manica Skyview Hotel | Administration",
  description: "Manica Skyview Hotel — Staff administration and ERP",
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
