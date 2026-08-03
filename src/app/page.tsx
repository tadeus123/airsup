"use client";

import { useState } from "react";

type Step = "domain" | "secret" | "done";

export default function SetupPage() {
  const [step, setStep] = useState<Step>("domain");
  const [websiteDomain, setWebsiteDomain] = useState("");
  const [agentSecret, setAgentSecret] = useState("");
  const [prompt, setPrompt] = useState("");
  const [chatPrompt, setChatPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"install" | "chat" | null>(null);
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
      const json = (await res.json()) as {
        error?: string;
        prompt?: string;
        chatgptPrompt?: string;
      };
      if (!res.ok) throw new Error(json.error || "Setup failed");
      setPrompt(json.prompt || "");
      setChatPrompt(json.chatgptPrompt || "");
      setStep("done");
      setAgentSecret("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text: string, which: "install" | "chat") {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
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
          <h1>Paste this into Cursor, Codex, or Claude Code.</h1>
          <p className="setup-sub">
            One install prompt for your website project. Adds maximum machine-only discovery — no
            visible UI on the site, no logo, no chat widget, no redesign. Do not break anything
            already there.
          </p>
          <textarea className="setup-prompt" readOnly value={prompt} />
          <button
            type="button"
            className="setup-copy"
            onClick={() => void copyText(prompt, "install")}
          >
            {copied === "install" ? "Copied" : "Copy install prompt"}
          </button>

          <h2 className="setup-h2">Then talk to Supi in ChatGPT</h2>
          <p className="setup-sub">
            After the site is wired, paste this into ChatGPT (with browsing). ChatGPT does not
            auto-discover agent cards on every domain yet.
          </p>
          <textarea className="setup-prompt setup-prompt-sm" readOnly value={chatPrompt} />
          <button
            type="button"
            className="setup-copy setup-copy-secondary"
            onClick={() => void copyText(chatPrompt, "chat")}
          >
            {copied === "chat" ? "Copied" : "Copy ChatGPT prompt"}
          </button>
        </>
      ) : null}

      {error ? <p className="err">{error}</p> : null}
    </main>
  );
}
