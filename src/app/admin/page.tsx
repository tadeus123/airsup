"use client";

import { useCallback, useEffect, useState } from "react";

type AdminMessage = {
  contextId: string;
  role: string;
  content: string;
  createdAt: string;
};

type AdminConversation = {
  contextId: string;
  websiteDomain: string;
  messageCount: number;
  turns: number;
  isRealConversation: boolean;
  firstAt: string;
  lastAt: string;
  messages: AdminMessage[];
};

type AdminPayload = {
  websiteDomain: string;
  connected: boolean;
  storage: string;
  conversations: AdminConversation[];
  error?: string;
};

type ToolTrace = {
  id?: string;
  createdAt?: string;
  contextId: string;
  toolsCalled: Array<{ name: string; ok: boolean }>;
  loops: number;
  intentCalendar: boolean;
  intentGmail: boolean;
  usedOk: boolean;
  missReason: string;
  provider?: string;
};

function fmt(iso: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [savedPassword, setSavedPassword] = useState("");
  const [data, setData] = useState<AdminPayload | null>(null);
  const [traces, setTraces] = useState<ToolTrace[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (pwd: string) => {
    if (!pwd) return;
    setBusy(true);
    setError("");
    try {
      const [convRes, toolsRes] = await Promise.all([
        fetch("/api/admin/conversations", {
          headers: { "x-admin-password": pwd },
          cache: "no-store",
        }),
        fetch("/api/admin/tools", {
          headers: { "x-admin-password": pwd },
          cache: "no-store",
        }),
      ]);
      const json = (await convRes.json()) as AdminPayload;
      const toolsJson = (await toolsRes.json()) as { traces?: ToolTrace[]; error?: string };
      if (!convRes.ok) throw new Error(json.error || "Failed to load");
      if (!toolsRes.ok) throw new Error(toolsJson.error || "Failed to load tool traces");
      setData(json);
      setTraces(toolsJson.traces || []);
      setSavedPassword(pwd);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
      setTraces([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!savedPassword) return;
    const id = setInterval(() => {
      void load(savedPassword);
    }, 8000);
    return () => clearInterval(id);
  }, [savedPassword, load]);

  return (
    <main className="admin">
      <header className="admin-header">
        <div>
          <h1>Airsup admin</h1>
          <p>Live conversations + tool-use traces</p>
        </div>
        {savedPassword ? (
          <button type="button" disabled={busy} onClick={() => void load(savedPassword)}>
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        ) : null}
      </header>

      {!savedPassword ? (
        <form
          className="admin-login"
          onSubmit={(e) => {
            e.preventDefault();
            void load(password);
          }}
        >
          <input
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <button type="submit" disabled={busy}>
            Open
          </button>
          <p className="admin-hint">
            Use <code>ADMIN_PASSWORD</code>, <code>SETUP_PASSWORD</code>, or your{" "}
            <code>AIRSUP_DB_TOKEN</code>.
          </p>
        </form>
      ) : null}

      {error ? <p className="admin-error">{error}</p> : null}

      {data ? (
        <>
          <section className="admin-meta">
            <div>
              <span>Website</span>
              <strong>{data.websiteDomain || "(none)"}</strong>
            </div>
            <div>
              <span>Connected</span>
              <strong>{data.connected ? "yes" : "no"}</strong>
            </div>
            <div>
              <span>Storage</span>
              <strong>{data.storage}</strong>
            </div>
            <div>
              <span>Threads</span>
              <strong>{data.conversations.length}</strong>
            </div>
          </section>

          <section className="admin-tools">
            <h2>Tool traces</h2>
            <p className="admin-hint">
              Flags when calendar/gmail intent fired without the matching tool. No message bodies.
            </p>
            {traces.length === 0 ? (
              <p className="admin-empty">No tool traces yet.</p>
            ) : (
              <ul className="admin-trace-list">
                {traces.map((t) => {
                  const called =
                    t.toolsCalled?.map((c) => (c.ok ? c.name : `${c.name}!`)).join(", ") ||
                    "(none)";
                  return (
                    <li key={t.id || `${t.contextId}-${t.createdAt}`} className={t.usedOk ? "ok" : "miss"}>
                      <strong>{t.usedOk ? "ok" : "miss"}</strong>
                      <span>
                        {fmt(t.createdAt || "")} · {t.contextId.slice(0, 8)}…
                        {t.intentCalendar ? " · cal intent" : ""}
                        {t.intentGmail ? " · mail intent" : ""} · {called}
                        {t.missReason ? ` · ${t.missReason}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {data.conversations.length === 0 ? (
            <p className="admin-empty">No conversations yet. Talk to Supi, then refresh.</p>
          ) : (
            <div className="admin-list">
              {data.conversations.map((c) => (
                <article key={c.contextId} className="admin-thread">
                  <div className="admin-thread-top">
                    <div>
                      <strong>{c.websiteDomain}</strong>
                      <span className={c.isRealConversation ? "tag ok" : "tag"}>
                        {c.isRealConversation
                          ? `real conversation · ${c.turns} turns`
                          : `single exchange · ${c.turns} turn`}
                      </span>
                    </div>
                    <code>{c.contextId}</code>
                  </div>
                  <p className="admin-time">
                    {fmt(c.firstAt)} → {fmt(c.lastAt)} · {c.messageCount} messages
                  </p>
                  <div className="admin-msgs">
                    {c.messages.map((m, i) => (
                      <div key={`${c.contextId}-${i}`} className={`msg ${m.role}`}>
                        <div className="msg-meta">
                          <strong>{m.role === "assistant" ? "Supi" : "Visitor / ChatGPT"}</strong>
                          <span>{fmt(m.createdAt)}</span>
                        </div>
                        <pre>{m.content}</pre>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}
    </main>
  );
}
