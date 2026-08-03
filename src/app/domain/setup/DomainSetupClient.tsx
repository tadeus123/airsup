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
  oauthConfigured: boolean;
  error?: string;
};

export default function DomainSetupClient() {
  const search = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<"calendar" | "gmail" | null>(null);
  const [error, setError] = useState("");

  const calendarFlash = search.get("google") === "connected" || search.get("calendar") === "connected";
  const gmailFlash = search.get("gmail") === "connected";
  const errorFlash = search.get("error")
    ? decodeURIComponent(search.get("error") || "")
    : "";

  async function loadStatus() {
    const res = await fetch("/api/google/status");
    const json = (await res.json()) as Status;
    if (!res.ok) throw new Error(json.error || "Failed to load status");
    setStatus({
      ...json,
      calendarConnected: Boolean(json.calendarConnected ?? json.googleConnected),
      calendarEmail: json.calendarEmail || json.googleEmail || "",
      gmailConnected: Boolean(json.gmailConnected),
      gmailEmail: json.gmailEmail || "",
    });
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
      setStatus({
        ...json,
        calendarConnected: Boolean(json.calendarConnected ?? json.googleConnected),
        calendarEmail: json.calendarEmail || json.googleEmail || "",
        gmailConnected: Boolean(json.gmailConnected),
        gmailEmail: json.gmailEmail || "",
      });
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
    <main className="setup">
      <h1>Connect Google.</h1>
      {status?.websiteDomain ? (
        <p className="setup-sub">{status.websiteDomain}</p>
      ) : null}
      <p className="setup-sub">
        Connect the website owner&apos;s Calendar and Gmail so Supi can schedule and email.
      </p>

      {!status && !error ? <p className="setup-sub">Loading…</p> : null}

      {status && !status.connected ? (
        <p className="err">Connect your domain and AI API key on the home page first.</p>
      ) : null}

      {status?.connected ? (
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
              <p className="ok">Gmail linked as {status.gmailEmail || "Google account"}.</p>
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
