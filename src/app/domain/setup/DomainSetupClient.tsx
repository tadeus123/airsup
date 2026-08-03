"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Status = {
  websiteDomain: string;
  connected: boolean;
  calendarConnected: boolean;
  calendarEmail: string;
  gmailConnected: boolean;
  gmailEmail: string;
  googleConnected?: boolean;
  googleEmail?: string;
  ownerGoals?: string;
  oauthConfigured: boolean;
  example?: string;
  error?: string;
};

export default function DomainSetupClient() {
  const search = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<"calendar" | "gmail" | "goals" | null>(null);
  const [goals, setGoals] = useState("");
  const [goalsSaved, setGoalsSaved] = useState(false);
  const [example, setExample] = useState("");
  const [error, setError] = useState("");

  const calendarFlash =
    search.get("google") === "connected" || search.get("calendar") === "connected";
  const gmailFlash = search.get("gmail") === "connected";
  const errorFlash = search.get("error")
    ? decodeURIComponent(search.get("error") || "")
    : "";

  function normalizeStatus(json: Status): Status {
    return {
      ...json,
      calendarConnected: Boolean(json.calendarConnected ?? json.googleConnected),
      calendarEmail: json.calendarEmail || json.googleEmail || "",
      gmailConnected: Boolean(json.gmailConnected),
      gmailEmail: json.gmailEmail || "",
      ownerGoals: json.ownerGoals || "",
    };
  }

  async function loadStatus() {
    const [googleRes, goalsRes] = await Promise.all([
      fetch("/api/google/status"),
      fetch("/api/goals"),
    ]);
    const googleJson = (await googleRes.json()) as Status;
    const goalsJson = (await goalsRes.json()) as Status;
    if (!googleRes.ok) throw new Error(googleJson.error || "Failed to load status");
    if (!goalsRes.ok) throw new Error(goalsJson.error || "Failed to load goals");
    const merged = normalizeStatus({ ...googleJson, ...goalsJson });
    setStatus(merged);
    setGoals(merged.ownerGoals || "");
    setExample(goalsJson.example || "");
  }

  useEffect(() => {
    void (async () => {
      try {
        await loadStatus();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  async function connect(service: "calendar" | "gmail") {
    setBusy(service);
    setError("");
    try {
      const res = await fetch("/api/google/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ service }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error || `Could not start ${service} OAuth`);
      }
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  async function disconnect(service: "calendar" | "gmail") {
    setBusy(service);
    setError("");
    try {
      const res = await fetch("/api/google/disconnect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ service }),
      });
      const json = (await res.json()) as Status & { error?: string };
      if (!res.ok) throw new Error(json.error || "Disconnect failed");
      setStatus(normalizeStatus(json));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function saveGoals() {
    setBusy("goals");
    setError("");
    setGoalsSaved(false);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerGoals: goals }),
      });
      const json = (await res.json()) as Status & { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not save goals");
      const merged = normalizeStatus(json);
      setStatus((prev) => ({ ...(prev || merged), ...merged }));
      setGoals(merged.ownerGoals || "");
      setGoalsSaved(true);
      setTimeout(() => setGoalsSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const calendarConnected = Boolean(status?.calendarConnected);
  const gmailConnected = Boolean(status?.gmailConnected);
  const oauthReady = status?.oauthConfigured !== false;

  return (
    <main className="setup setup-wide">
      <h1>Domain setup.</h1>
      {status?.websiteDomain ? (
        <p className="setup-sub">{status.websiteDomain}</p>
      ) : null}

      {!status && !error ? <p className="setup-sub">Loading…</p> : null}

      {status && !status.connected ? (
        <p className="err">Connect your domain and AI API key on the home page first.</p>
      ) : null}

      {status?.connected ? (
        <>
          <section className="setup-section">
            <h2>Google</h2>
            <p className="setup-sub">
              Connect Calendar and Gmail so Supi can book calls and send invites.
            </p>
            <div className="setup-actions">
              {!calendarConnected ? (
                <button
                  type="button"
                  className="setup-copy"
                  onClick={() => void connect("calendar")}
                  disabled={busy !== null || !oauthReady}
                >
                  {busy === "calendar" ? "…" : "Connect your Google Calendar"}
                </button>
              ) : (
                <>
                  <p className="ok">
                    Calendar linked as {status.calendarEmail || "Google account"}.
                  </p>
                  <button
                    type="button"
                    className="setup-copy setup-copy-muted"
                    onClick={() => void disconnect("calendar")}
                    disabled={busy !== null}
                  >
                    {busy === "calendar" ? "…" : "Disconnect Calendar"}
                  </button>
                </>
              )}

              {!gmailConnected ? (
                <button
                  type="button"
                  className="setup-copy"
                  onClick={() => void connect("gmail")}
                  disabled={busy !== null || !oauthReady}
                >
                  {busy === "gmail" ? "…" : "Connect Gmail"}
                </button>
              ) : (
                <>
                  <p className="ok">
                    Gmail linked as {status.gmailEmail || "Google account"}.
                  </p>
                  <button
                    type="button"
                    className="setup-copy setup-copy-muted"
                    onClick={() => void disconnect("gmail")}
                    disabled={busy !== null}
                  >
                    {busy === "gmail" ? "…" : "Disconnect Gmail"}
                  </button>
                </>
              )}
            </div>
          </section>

          <section className="setup-section">
            <h2>Goals / playbooks</h2>
            <p className="setup-sub">
              Freeform instructions for Supi — podcast screening, intros, booking rules, anything.
              Saved text is injected into the agent. Not hardcoded product logic.
            </p>
            <textarea
              className="setup-prompt setup-goals"
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              placeholder={example || "Write how Supi should screen, book, and follow up…"}
              rows={14}
            />
            <div className="setup-actions setup-actions-row">
              <button
                type="button"
                className="setup-copy"
                onClick={() => void saveGoals()}
                disabled={busy !== null}
              >
                {busy === "goals" ? "…" : goalsSaved ? "Saved" : "Save"}
              </button>
              {example ? (
                <button
                  type="button"
                  className="setup-copy setup-copy-muted"
                  onClick={() => setGoals(example)}
                  disabled={busy !== null}
                >
                  Load podcast example
                </button>
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      {status && status.oauthConfigured === false ? (
        <p className="err">
          Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the Airsup deployment, then redeploy.
        </p>
      ) : null}

      {calendarFlash ? <p className="ok">Google Calendar connected.</p> : null}
      {gmailFlash ? <p className="ok">Gmail connected.</p> : null}
      {errorFlash ? <p className="err">{errorFlash}</p> : null}
      {error ? <p className="err">{error}</p> : null}
    </main>
  );
}
