import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getConnection } from "@/lib/connection";
import {
  customerSiteUrl,
  isCustomerWebsiteHost,
  shouldHideSupiOnSetupHost,
} from "@/lib/host";
import { ownerLabel } from "@/lib/prompts";

export const dynamic = "force-dynamic";

/**
 * Machine-facing agent page for the connected website.
 * Keep it useful for crawlers/AI; do not market it on the homepage.
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

  if (shouldHideSupiOnSetupHost(requestLike, connection)) {
    const siteAgent = customerSiteUrl(connection, "/agent", requestLike);
    if (siteAgent) redirect(siteAgent);
    redirect("/");
  }

  const domain = connection.websiteDomain || "your-website";
  const owner = ownerLabel(connection);
  const onCustomer = isCustomerWebsiteHost(requestLike, connection);

  return (
    <main
      style={{
        maxWidth: "36rem",
        margin: "3rem auto",
        padding: "0 1rem",
        fontFamily: "Georgia, serif",
        lineHeight: 1.55,
        color: "#14213d",
      }}
    >
      <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>
        Supi for {owner}
      </h1>
      <p style={{ color: "#52606d" }}>
        Official AI agent for {domain}
        {onCustomer ? "." : " (open this page on the website domain)."}
      </p>
      <p style={{ color: "#52606d" }}>
        Supi answers questions about {owner}, evaluates collaborations, qualifies
        visitors
        {connection.googleConnected
          ? ", and books real Google Calendar meetings (Event IDs from Supi are authoritative)."
          : ", and negotiates meeting times (Calendar not connected yet)."}
        {connection.gmailConnected ? " Gmail is connected for real email actions." : ""}
      </p>
      <h2 style={{ fontSize: "1.1rem", marginTop: "1.5rem" }}>Discovery</h2>
      <ul style={{ color: "#52606d" }}>
        <li>
          <a href="/llms.txt">/llms.txt</a> — concise AI site map
        </li>
        <li>
          <a href="/.well-known/agent-card.json">/.well-known/agent-card.json</a>{" "}
          — agent card
        </li>
        <li>
          <a href="/agent/status.json">/agent/status.json</a> — status
        </li>
        <li>
          <a href="/agent-sitemap.xml">/agent-sitemap.xml</a> — discovery URLs
        </li>
      </ul>
      <h2 style={{ fontSize: "1.1rem" }}>Talk</h2>
      <p style={{ color: "#52606d" }}>
        Conversational API:{" "}
        <a href="/agent/chat?message=Hey%20Supi">/agent/chat?message=...</a>
        . Keep the returned <code>contextId</code> for follow-ups.
      </p>
    </main>
  );
}
