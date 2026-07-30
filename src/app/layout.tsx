import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Airsup — activate Supi on your website",
  description: "Connect your website domain to your real agent. Supi is the Airsup site agent.",
  icons: { icon: "/supi.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
