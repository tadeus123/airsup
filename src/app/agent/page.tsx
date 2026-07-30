import { SupiIcon } from "@/components/SupiIcon";
import { getConnection, publicOrigin } from "@/lib/connection";

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const { connection, storage } = await getConnection();
  const origin = publicOrigin(connection, "https://airsup-peach.vercel.app");
  const nowDoing = connection.connected
    ? `Supi is connected for ${connection.websiteDomain} and ready for live conversations.`
    : "Waiting for setup on the home page to activate Supi.";

  return (
    <main
      style={{
        maxWidth: "42rem",
        margin: "0 auto",
        padding: "3rem 1.25rem 4rem",
        fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
      }}
    >
      <div style={{ display: "flex", gap: "0.9rem", alignItems: "center" }}>
        <SupiIcon size={56} />
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)", margin: 0 }}>Supi</h1>
      </div>
      <p style={{ color: "#52606d", lineHeight: 1.55, marginTop: "1rem" }}>
        Supi is the live <strong>Airsup</strong> agent for this website. ChatGPT and other agents can
        talk to Supi without a plugin.
      </p>
      <div
        style={{
          background: "#0f6e56",
          color: "#f7f3ea",
          padding: "1rem 1.1rem",
          borderRadius: "0.75rem",
          margin: "1.5rem 0",
        }}
      >
        <strong
          style={{
            display: "block",
            fontSize: "0.85rem",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            opacity: 0.85,
            marginBottom: "0.35rem",
          }}
        >
          Right now
        </strong>
        {nowDoing}
      </div>

      <h2 style={{ fontSize: "1.2rem" }}>How to talk to Supi</h2>
      <ol style={{ color: "#52606d", lineHeight: 1.55 }}>
        <li>
          Open{" "}
          <a href={`${origin}/agent/chat?message=${encodeURIComponent("Hey Supi, when are you free for a meeting?")}`}>
            /agent/chat?message=...
          </a>
        </li>
        <li>Read Supi&apos;s reply on that page.</li>
        <li>
          Continue with the same <code>contextId</code> from the page, e.g.{" "}
          <code>/agent/chat?contextId=...&amp;message=Thursday 15:00 works</code>
        </li>
        <li>Repeat until a meeting time is confirmed.</li>
      </ol>

      <p style={{ color: "#52606d" }}>
        Domain: <code>{connection.websiteDomain || "(not set)"}</code>
      </p>
      <p style={{ color: "#52606d" }}>
        Backend: <code>{connection.connected ? "openai" : "builtin"}</code> · storage:{" "}
        <code>{storage}</code>
      </p>
      <p style={{ color: "#52606d" }}>
        Card: <a href="/.well-known/agent-card.json">/.well-known/agent-card.json</a> · Status:{" "}
        <a href="/agent/status.json">/agent/status.json</a>
      </p>
    </main>
  );
}
