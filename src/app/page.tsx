"use client";

import { useState } from "react";

type Step = "domain" | "secret" | "done";

export default function SetupPage() {
  const [step, setStep] = useState<Step>("domain");
  const [websiteDomain, setWebsiteDomain] = useState("");
  const [agentSecret, setAgentSecret] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function finish() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/connection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          websiteDomain,
          agentSecret,
          ownerTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const json = (await res.json()) as { error?: string; prompt?: string };
      if (!res.ok) throw new Error(json.error || "Setup failed");
      setPrompt(json.prompt || "");
      setStep("done");
      setAgentSecret("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function onDomainSubmit() {
    const domain = websiteDomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .replace(/^www\./, "");
    if (!domain) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/google/status");
      const json = (await res.json().catch(() => ({}))) as {
        connected?: boolean;
        websiteDomain?: string;
      };
      const connectedDomain = (json.websiteDomain || "")
        .toLowerCase()
        .replace(/^www\./, "");
      if (json.connected && connectedDomain === domain) {
        window.location.href = "/domain/setup";
        return;
      }
      setStep("secret");
    } catch {
      setStep("secret");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={`setup${step === "done" ? " setup-done" : ""}`}>
      {step === "domain" ? (
        <>
          <h1>Enter your domain.</h1>
          <form
            className="setup-form"
            onSubmit={(e) => {
              e.preventDefault();
              void onDomainSubmit();
            }}
          >
            <div className="setup-row">
              <input
                type="text"
                name="domain"
                autoComplete="url"
                placeholder="tademehl.com"
                value={websiteDomain}
                onChange={(e) => setWebsiteDomain(e.target.value)}
                autoFocus
                required
              />
              <button type="submit" disabled={busy}>
                {busy ? "…" : "Enter"}
              </button>
            </div>
          </form>
        </>
      ) : null}

      {step === "secret" ? (
        <>
          <h1>Enter your AI API key.</h1>
          <form
            className="setup-form"
            onSubmit={(e) => {
              e.preventDefault();
              void finish();
            }}
          >
            <div className="setup-row">
              <input
                type="password"
                name="apiKey"
                autoComplete="off"
                placeholder="sk-..."
                value={agentSecret}
                onChange={(e) => setAgentSecret(e.target.value)}
                autoFocus
                required
              />
              <button type="submit" disabled={busy}>
                {busy ? "…" : "Enter"}
              </button>
            </div>
          </form>
        </>
      ) : null}

      {step === "done" ? (
        <>
          <h1>Paste this into Cursor, Codex, or Claude Code.</h1>
          <p className="setup-sub">
            One install prompt for your website project. Adds maximum machine-only discovery — no
            visible UI on the site, no logo, no chat widget, no redesign. Do not break anything
            already there.
          </p>
          <textarea className="setup-prompt" readOnly value={prompt} />
          <button type="button" className="setup-copy" onClick={() => void copyPrompt()}>
            {copied ? "Copied" : "Copy prompt"}
          </button>
          <a href="/domain/setup" className="setup-copy setup-copy-muted">
            Connect Google Calendar
          </a>
        </>
      ) : null}

      {error ? <p className="err">{error}</p> : null}
    </main>
  );
}
