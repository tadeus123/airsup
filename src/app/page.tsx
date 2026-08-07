"use client";

import { useState } from "react";

type Step = "handle" | "chatgpt" | "plugin";

type OnboardResult = {
  handle: string;
  domain: string;
  displayName: string;
  token: string;
  chatgptUrl: string;
  schedulePrompt: string;
  pluginUrl: string;
  plugin: {
    openapiUrl: string;
    steps: string[];
  };
};

function cleanHandle(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export default function SetupPage() {
  const [step, setStep] = useState<Step>("handle");
  const [handle, setHandle] = useState("");
  const [result, setResult] = useState<OnboardResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"token" | "plugin" | "prompt" | "">("");
  const [error, setError] = useState("");

  async function onHandleSubmit() {
    const h = cleanHandle(handle);
    if (!h) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle: h }),
      });
      const json = (await res.json()) as OnboardResult & { error?: string };
      if (!res.ok) throw new Error(json.error || "Setup failed");
      setResult(json);
      setStep("chatgpt");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy(kind: "token" | "plugin" | "prompt", value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    setTimeout(() => setCopied(""), 1500);
  }

  return (
    <main className={`setup${step !== "handle" ? " setup-done" : ""}`}>
      {step === "handle" ? (
        <>
          <h1>Choose your handle.</h1>
          <p className="setup-sub">
            {cleanHandle(handle)
              ? `Others will say: talk to ${cleanHandle(handle)}'s supi`
              : "No website needed — connect your ChatGPT next."}
          </p>
          <form
            className="setup-form"
            onSubmit={(e) => {
              e.preventDefault();
              void onHandleSubmit();
            }}
          >
            <div className="setup-row">
              <input
                type="text"
                name="handle"
                autoComplete="username"
                placeholder="konstantin"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                autoFocus
                required
                minLength={2}
              />
              <button type="submit" disabled={busy}>
                {busy ? "…" : "Enter"}
              </button>
            </div>
          </form>
        </>
      ) : null}

      {step === "chatgpt" && result ? (
        <>
          <h1>Connect ChatGPT.</h1>
          <p className="setup-sub">
            Opens ChatGPT with a prompt that creates your hourly Airsup worker immediately
            and starts the first run ASAP.
          </p>
          <p className="setup-sub">
            Handle: <strong>{result.handle}</strong>
          </p>
          <div className="setup-actions">
            <a
              className="setup-copy"
              href={result.chatgptUrl}
              target="_blank"
              rel="noreferrer"
            >
              Connect ChatGPT
            </a>
            <button
              type="button"
              className="setup-copy setup-copy-muted"
              onClick={() => void copy("prompt", result.schedulePrompt)}
            >
              {copied === "prompt" ? "Copied prompt" : "Copy prompt instead"}
            </button>
            <button
              type="button"
              className="setup-copy setup-copy-muted"
              onClick={() => setStep("plugin")}
            >
              Next — Actions setup
            </button>
          </div>
        </>
      ) : null}

      {step === "plugin" && result ? (
        <>
          <h1>Add Airsup Actions.</h1>
          <p className="setup-sub">
            Do <strong>not</strong> use ChatGPT “New Plugin” / MCP / OAuth. Use a Custom GPT →
            Actions instead.
          </p>

          <ol className="setup-steps">
            <li>ChatGPT → create a GPT → Configure → Actions → Create new action</li>
            <li>
              Click <strong>Import from URL</strong> (not “Server URL”, not MCP)
            </li>
            <li>
              Paste the schema URL below
            </li>
            <li>
              Authentication: <strong>API Key</strong> (not OAuth)
            </li>
            <li>
              Auth Type: <strong>Bearer</strong>
            </li>
            <li>Paste your API token into the API Key field</li>
            <li>Save the GPT</li>
          </ol>

          <label className="setup-label">Import from URL (schema)</label>
          <textarea className="setup-prompt" readOnly value={result.pluginUrl} rows={2} />
          <button
            type="button"
            className="setup-copy"
            onClick={() => void copy("plugin", result.pluginUrl)}
          >
            {copied === "plugin" ? "Copied" : "Copy Import from URL"}
          </button>

          <label className="setup-label">API Key (Bearer token)</label>
          <textarea className="setup-prompt" readOnly value={result.token} rows={2} />
          <button
            type="button"
            className="setup-copy setup-copy-muted"
            onClick={() => void copy("token", result.token)}
          >
            {copied === "token" ? "Copied" : "Copy API Key / token"}
          </button>

          <p className="setup-sub">
            ChatGPT field names: <strong>Import from URL</strong> + <strong>API Key</strong> +{" "}
            <strong>Bearer</strong>. Ignore Auth URL / Token URL / Client ID — those are OAuth-only.
          </p>

          <button
            type="button"
            className="setup-copy setup-copy-muted"
            onClick={() => setStep("chatgpt")}
          >
            Back
          </button>
        </>
      ) : null}

      {error ? <p className="err">{error}</p> : null}
    </main>
  );
}
