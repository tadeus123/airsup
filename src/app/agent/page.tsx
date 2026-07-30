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
 * On the Airsup setup host: send browsers to the connected website.
 * On the customer website: show a minimal Supi page (chat is via /agent/chat).
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
      }}
    >
      <h1 style={{ fontSize: "1.6rem" }}>Supi for {owner}</h1>
      <p style={{ color: "#52606d", lineHeight: 1.5 }}>
        {onCustomer
          ? `Official site agent for ${domain}. ChatGPT and other clients should use the Agent Card and /agent/chat on this domain.`
          : `Supi represents ${owner} on ${domain}. Prefer opening this page on the website domain.`}
      </p>
      <p style={{ color: "#52606d" }}>
        Card:{" "}
        <a href="/.well-known/agent-card.json">/.well-known/agent-card.json</a>
        {" · "}
        Chat:{" "}
        <a href="/agent/chat?message=Hey%20Supi">/agent/chat</a>
      </p>
    </main>
  );
}
