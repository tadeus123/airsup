import { getConnection, publicOrigin } from "@/lib/connection";

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const { connection, storage } = await getConnection();
  // On the server during SSR, request origin may be local; prefer configured domain.
  const origin = publicOrigin(connection, "https://aircart-connect.vercel.app");
  const nowDoing = connection.connected
    ? `Connected real agent for ${connection.websiteDomain} and ready for conversations.`
    : "Waiting for setup on the home page.";

  return (
    <main
      style={{
        maxWidth: "42rem",
        margin: "0 auto",
        padding: "3rem 1.25rem 4rem",
        fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
      }}
    >
      <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)", marginBottom: "0.75rem" }}>
        AirCart Agent
      </h1>
      <p style={{ color: "#52606d", lineHeight: 1.55 }}>
        AirCart Connect hosts your website agent setup and forwards chat to your real agent
        webhook.
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
      <p style={{ color: "#52606d" }}>
        Domain: <code>{connection.websiteDomain || "(not set)"}</code>
      </p>
      <p style={{ color: "#52606d" }}>
        Backend: <code>{connection.connected ? "webhook" : "builtin"}</code> · storage:{" "}
        <code>{storage}</code>
      </p>
      <p style={{ color: "#52606d" }}>
        Setup: <a href="/">/</a> · Status: <a href="/agent/status.json">/agent/status.json</a> · Card:{" "}
        <a href="/.well-known/agent-card.json">/.well-known/agent-card.json</a>
      </p>
      <p style={{ color: "#52606d" }}>
        Chat: <code>POST {origin}/agent/chat</code>
      </p>
    </main>
  );
}
