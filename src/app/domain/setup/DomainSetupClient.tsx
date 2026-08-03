"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Status = {
  websiteDomain: string;
  connected: boolean;
  googleConnected: boolean;
  googleEmail: string;
  oauthConfigured: boolean;
  error?: string;
};

export default function DomainSetupClient() {
  const search = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const connectedFlash = search.get("google") === "connected";
  const errorFlash = search.get("error")
    ? decodeURIComponent(search.get("error") || "")
    : "";

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/google/status");
        const json = (await res.json()) as Status;
        if (!res.ok) throw new Error(json.error || "Failed to load status");
        setStatus(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/google/start", { method: "POST" });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || "Could not start Google OAuth");
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/google/disconnect", { method: "POST" });
      const json = (await res.json()) as Status & { error?: string };
      if (!res.ok) throw new Error(json.error || "Disconnect failed");
      setStatus(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const connected = Boolean(status?.googleConnected);

  return (
    <main className="setup">
      <h1>{connected ? "Google Calendar connected." : "Connect your Google Calendar"}</h1>
      {status?.websiteDomain ? (
        <p className="setup-sub">{status.websiteDomain}</p>
      ) : null}

      {!status && !error ? <p className="setup-sub">Loading…</p> : null}

      {status && !status.connected ? (
        <p className="err">Connect your domain and AI API key on the home page first.</p>
      ) : null}

      {status?.connected && !connected ? (
        <button
          type="button"
          className="setup-copy"
          onClick={() => void connect()}
          disabled={busy || status.oauthConfigured === false}
        >
          {busy ? "…" : "Connect your Google Calendar"}
        </button>
      ) : null}

      {status?.connected && connected ? (
        <>
          <p className="ok">
            Linked as {status.googleEmail || "Google account"}. Supi can schedule meetings and
            manage Calendar / Gmail for this website owner.
          </p>
          <button
            type="button"
            className="setup-copy setup-copy-muted"
            onClick={() => void disconnect()}
            disabled={busy}
          >
            {busy ? "…" : "Disconnect Google"}
          </button>
        </>
      ) : null}

      {status && status.oauthConfigured === false ? (
        <p className="err">
          Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the Airsup deployment, then redeploy.
        </p>
      ) : null}

      {connectedFlash ? <p className="ok">Google Calendar connected.</p> : null}
      {errorFlash ? <p className="err">{errorFlash}</p> : null}
      {error ? <p className="err">{error}</p> : null}
    </main>
  );
}
