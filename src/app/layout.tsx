import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Airsup",
  description: "Set up Supi on your website",
  icons: { icon: "/supi.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="service-meta" type="application/json" href="/.well-known/agent-card.json" />
        <link
          rel="alternate"
          type="application/json"
          href="/.well-known/agent-card.json"
          title="Supi Agent Card"
        />
      </head>
      <body className={outfit.className}>{children}</body>
    </html>
  );
}
