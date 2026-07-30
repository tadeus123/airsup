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
        body: JSON.stringify({ websiteDomain, agentSecret }),
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

  return (
    <main className={`setup${step === "done" ? " setup-done" : ""}`}>
      {step === "domain" ? (
        <>
          <h1>Enter your domain.</h1>
          <form
            className="setup-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!websiteDomain.trim()) return;
              setError("");
              setStep("secret");
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
              <button type="submit">Enter</button>
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
          <h1>Paste this into Cursor.</h1>
          <p className="setup-sub">
            One prompt for your website project. It must not break or change anything already on the
            site — only additive invisible discovery.
          </p>
          <textarea className="setup-prompt" readOnly value={prompt} />
          <button type="button" className="setup-copy" onClick={() => void copyPrompt()}>
            {copied ? "Copied" : "Copy prompt"}
          </button>
        </>
      ) : null}

      {error ? <p className="err">{error}</p> : null}
    </main>
  );
}
