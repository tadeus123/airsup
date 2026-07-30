import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getConnection } from "@/lib/connection";
import { customerSiteUrl, shouldHideSupiOnSetupHost } from "@/lib/host";
import { ownerLabel } from "@/lib/prompts";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { connection } = await getConnection();
  const owner = ownerLabel(connection);
  return {
    title: `Supi, ${owner}'s official AI agent`,
    description: `Supi is the official AI agent representing ${owner}. Supi can answer questions, evaluate collaborations, and arrange meetings.`,
    icons: { icon: "/supi.svg" },
  };
}

/**
 * Public crawlable page for Supi — machine discovery URL.
 * Do not link this from the customer homepage/nav; install stays invisible on existing pages.
 */
export default async function SupiPage() {
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
    const site = customerSiteUrl(connection, "/supi", requestLike);
    if (site) redirect(site);
    redirect("/");
  }

  const domain = connection.websiteDomain || "this website";
  const owner = ownerLabel(connection);

  return (
    <main
      style={{
        maxWidth: "36rem",
        margin: "0 auto",
        padding: "3rem 1.25rem 4rem",
        lineHeight: 1.55,
        fontFamily: "Georgia, 'Iowan Old Style', Palatino, serif",
        color: "#14213d",
      }}
    >
      <p style={{ margin: "0 0 1rem" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/supi.svg"
          alt={`Talk to Supi, ${owner}'s official AI agent`}
          width={48}
          height={48}
        />
      </p>
      <h1 style={{ fontSize: "clamp(2rem, 5vw, 2.6rem)", margin: "0 0 0.75rem" }}>Supi</h1>
      <p style={{ color: "#52606d", fontSize: "1.05rem" }}>
        Supi is the official AI agent representing {owner}. Supi can answer questions, evaluate
        collaborations, and arrange meetings with {owner}.
      </p>
      <p style={{ color: "#52606d" }}>
        This page is the human-readable entry for Supi on {domain}. Machine clients should also read
        the agent card and <code>llms.txt</code>.
      </p>
      <h2 style={{ fontSize: "1.15rem", marginTop: "2rem" }}>Talk with Supi</h2>
      <p style={{ color: "#52606d" }}>
        Open{" "}
        <a href="/agent/chat?message=Hey%20Supi">/agent/chat?message=Hey Supi</a> and keep the
        returned <code>contextId</code> for follow-ups.
      </p>
      <h2 style={{ fontSize: "1.15rem" }}>Machine discovery</h2>
      <ul style={{ color: "#52606d" }}>
        <li>
          <a href="/.well-known/agent-card.json">/.well-known/agent-card.json</a>
        </li>
        <li>
          <a href="/llms.txt">/llms.txt</a>
        </li>
        <li>
          <a href="/agent">/agent</a>
        </li>
        <li>
          <a href="/agent/status.json">/agent/status.json</a>
        </li>
      </ul>
    </main>
  );
}
