import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AirCart Connect",
  description: "Connect your website domain to your real agent.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
