"use client";

import { useEffect, useMemo, useState } from "react";

type ConnectionResponse = {
  websiteDomain: string;
  agentWebhookUrl: string;
  agentSecretSet: boolean;
  connected: boolean;
  updatedAt: string;
  storage: "redis" | "env" | "none";
  websiteCursorPrompt?: string;
  chatgptPrompt?: string;
  vercelEnv?: string;
  tip?: string;
  error?: string;
};

const styles: Record<string, React.CSSProperties> = {
  main: { width: "min(740px, calc(100% - 2rem))", margin: "0 auto", padding: "2.5rem 0 4rem" },
  lead: { color: "var(--muted)", marginTop: 0 },
  panel: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: "1rem",
    padding: "1.2rem 1.25rem 1.35rem",
    marginBottom: "1rem",
  },
  label: { display: "block", margin: "0.85rem 0 0.35rem", fontSize: "0.92rem" },
  input: {
    width: "100%",
    border: "1px solid var(--line)",
    borderRadius: "0.65rem",
    padding: "0.75rem 0.85rem",
    font: "inherit",
    background: "#fff",
  },
  hint: { color: "var(--muted)", fontSize: "0.88rem", margin: "0.35rem 0 0" },
  row: { display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1.1rem" },
  button: {
    border: 0,
    borderRadius: 999,
    padding: "0.75rem 1.15rem",
    font: "inherit",
    cursor: "pointer",
    background: "var(--accent)",
    color: "#f7f3ea",
  },
  secondary: {
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "0.75rem 1.15rem",
    font: "inherit",
    cursor: "pointer",
    background: "transparent",
    color: "var(--ink)",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.45rem",
    padding: "0.35rem 0.7rem",
    borderRadius: 999,
    border: "1px solid var(--line)",
    background: "#fff",
    marginBottom: "1rem",
    fontSize: "0.88rem",
  },
  out: {
    whiteSpace: "pre-wrap",
    background: "#14213d",
    color: "#f4efe6",
    borderRadius: "0.75rem",
    padding: "0.9rem 1rem",
    minHeight: "4rem",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: "0.85rem",
  },
  textarea: {
    width: "100%",
    minHeight: "7.5rem",
    border: "1px solid var(--line)",
    borderRadius: "0.65rem",
    padding: "0.75rem 0.85rem",
    font: "inherit",
    background: "#fff",
  },
};

export default function SetupPage() {
  const [websiteDomain, setWebsiteDomain] = useState("");
  const [agentWebhookUrl, setAgentWebhookUrl] = useState("");
  const [agentSecret, setAgentSecret] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [data, setData] = useState<ConnectionResponse | null>(null);
  const [chatMessage, setChatMessage] = useState("What are you doing right now?");
  const [chatOut, setChatOut] = useState("No message yet.");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const headers = useMemo(() => {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (setupPassword) h["x-setup-password"] = setupPassword;
    return h;
  }, [setupPassword]);

  async function refresh() {
    const res = await fetch("/api/connection", { headers });
    const json = (await res.json()) as ConnectionResponse;
    if (!res.ok) throw new Error(json.error || "Failed to load");
    setData(json);
    setWebsiteDomain(json.websiteDomain || "");
    setAgentWebhookUrl(json.agentWebhookUrl || "");
    setError("");
  }

  useEffect(() => {
    refresh().catch((e) => setError(String(e.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect() {
    setBusy(true);
    try {
      const res = await fetch("/api/connection", {
        method: "POST",
        headers,
        body: JSON.stringify({ websiteDomain, agentWebhookUrl, agentSecret }),
      });
      const json = (await res.json()) as ConnectionResponse;
      if (!res.ok) throw new Error(json.error || "Connect failed");
      setData(json);
      setAgentSecret("");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function testChat() {
    setBusy(true);
    setChatOut("Sending…");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: chatMessage }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Chat failed");
      setChatOut(JSON.stringify(json, null, 2));
    } catch (e) {
      setChatOut(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
  }

  const connected = Boolean(data?.connected);

  return (
    <main style={styles.main}>
      <h1 style={{ margin: "0 0 0.4rem", fontSize: "clamp(2rem, 5vw, 2.8rem)" }}>
        AirCart Connect
      </h1>
      <p style={styles.lead}>
        Enter your website domain and agent secret. This connects your real agent so ChatGPT can
        find it on your website.
      </p>

      <div style={styles.badge}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 99,
            background: connected ? "var(--accent)" : "var(--bad)",
            display: "inline-block",
          }}
        />
        {connected
          ? `Connected to ${data?.websiteDomain}`
          : "Not connected yet"}
        {data?.storage ? ` · storage: ${data.storage}` : ""}
      </div>
      {error ? <p style={{ color: "var(--bad)" }}>{error}</p> : null}
      {data?.tip ? <p style={styles.hint}>{data.tip}</p> : null}

      <section style={styles.panel}>
        <h2 style={{ margin: 0, fontSize: "1.2rem" }}>1. Connect agent to website</h2>

        <label style={styles.label} htmlFor="domain">
          Website domain
        </label>
        <input
          id="domain"
          style={styles.input}
          placeholder="tademehl.com"
          value={websiteDomain}
          onChange={(e) => setWebsiteDomain(e.target.value)}
        />
        <p style={styles.hint}>No https:// needed</p>

        <label style={styles.label} htmlFor="webhook">
          Real agent webhook URL
        </label>
        <input
          id="webhook"
          style={styles.input}
          placeholder="https://your-agent.example.com/hooks/a2a"
          value={agentWebhookUrl}
          onChange={(e) => setAgentWebhookUrl(e.target.value)}
        />

        <label style={styles.label} htmlFor="secret">
          Agent secret token
        </label>
        <input
          id="secret"
          type="password"
          style={styles.input}
          placeholder={data?.agentSecretSet ? "Secret saved — enter to replace" : "shared secret"}
          value={agentSecret}
          onChange={(e) => setAgentSecret(e.target.value)}
        />

        <label style={styles.label} htmlFor="password">
          Setup password (only if you set SETUP_PASSWORD on Vercel)
        </label>
        <input
          id="password"
          type="password"
          style={styles.input}
          value={setupPassword}
          onChange={(e) => setSetupPassword(e.target.value)}
        />

        <div style={styles.row}>
          <button style={styles.button} disabled={busy} onClick={connect} type="button">
            Connect
          </button>
          <button style={styles.secondary} disabled={busy} onClick={() => refresh()} type="button">
            Refresh
          </button>
        </div>
      </section>

      <section style={styles.panel}>
        <h2 style={{ margin: 0, fontSize: "1.2rem" }}>2. Test chat</h2>
        <textarea
          style={styles.textarea}
          value={chatMessage}
          onChange={(e) => setChatMessage(e.target.value)}
        />
        <div style={styles.row}>
          <button style={styles.button} disabled={busy} onClick={testChat} type="button">
            Send test message
          </button>
        </div>
        <div style={{ ...styles.out, marginTop: "0.9rem" }}>{chatOut}</div>
      </section>

      <section style={styles.panel}>
        <h2 style={{ margin: 0, fontSize: "1.2rem" }}>3. Website Cursor prompt</h2>
        <p style={styles.hint}>
          Paste this into Cursor on your website project. It only adds proxy routes to this AirCart
          Connect deployment.
        </p>
        <textarea style={styles.textarea} readOnly value={data?.websiteCursorPrompt || ""} />
        <div style={styles.row}>
          <button
            style={styles.secondary}
            type="button"
            onClick={() => copy(data?.websiteCursorPrompt || "")}
          >
            Copy website prompt
          </button>
        </div>
      </section>

      <section style={styles.panel}>
        <h2 style={{ margin: 0, fontSize: "1.2rem" }}>4. ChatGPT prompt</h2>
        <textarea style={styles.textarea} readOnly value={data?.chatgptPrompt || ""} />
        <div style={styles.row}>
          <button
            style={styles.secondary}
            type="button"
            onClick={() => copy(data?.chatgptPrompt || "")}
          >
            Copy ChatGPT prompt
          </button>
        </div>
      </section>

      <section style={styles.panel}>
        <h2 style={{ margin: 0, fontSize: "1.2rem" }}>5. Vercel env (if no Redis yet)</h2>
        <p style={styles.hint}>
          Project Settings → Environment Variables → paste → Redeploy. Or add free Upstash Redis for
          instant saves.
        </p>
        <textarea style={styles.textarea} readOnly value={data?.vercelEnv || ""} />
        <div style={styles.row}>
          <button
            style={styles.secondary}
            type="button"
            onClick={() => copy(data?.vercelEnv || "")}
          >
            Copy env
          </button>
          <a href="/agent" style={{ alignSelf: "center" }}>
            Open public /agent page
          </a>
        </div>
      </section>
    </main>
  );
}
