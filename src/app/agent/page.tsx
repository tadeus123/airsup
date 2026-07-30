import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getConnection } from "@/lib/connection";
import { customerSiteUrl, isDirectBrowserNavigation } from "@/lib/host";

export const dynamic = "force-dynamic";

/**
 * Supi UI is never meant to live on the Airsup connector.
 * Direct browser visits are sent to the connected website (or setup).
 * Proxied requests from the customer domain still get a minimal machine page.
 */
export default async function AgentPage() {
  const { connection } = await getConnection();
  const headerStore = await headers();
  const requestLike = {
    headers: {
      get(name: string) {
        return headerStore.get(name);
      },
    },
  } as Request;

  if (isDirectBrowserNavigation(requestLike)) {
    const siteAgent = customerSiteUrl(connection, "/agent");
    if (siteAgent) redirect(siteAgent);
    redirect("/");
  }

  // Proxied from the customer website — short machine-oriented page, no chat UI.
  const domain = connection.websiteDomain || "your-website";
  return (
    <main style={{ maxWidth: "36rem", margin: "3rem auto", padding: "0 1rem", fontFamily: "Georgia, serif" }}>
      <h1 style={{ fontSize: "1.6rem" }}>Supi for {domain}</h1>
      <p style={{ color: "#52606d", lineHeight: 1.5 }}>
        This page is served for the connected website only. Talk with Supi via the website&apos;s{" "}
        <code>/agent/chat</code> endpoint or A2A interface — not via the Airsup setup host.
      </p>
      <p style={{ color: "#52606d" }}>
        Card: <a href="/.well-known/agent-card.json">/.well-known/agent-card.json</a>
      </p>
    </main>
  );
}
