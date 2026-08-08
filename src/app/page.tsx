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
  mcpUrl?: string;
  plugin: {
    openapiUrl: string;
    mcpUrl?: string;
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

  const mcpUrl = result?.mcpUrl || result?.plugin?.mcpUrl || result?.pluginUrl || "";

  return (
    <main className={`setup${step !== "handle" ? " setup-done" : ""}`}>
      {step === "handle" ? (
        <>
          <h1>Choose your handle.</h1>
          <p className="setup-sub">
            {cleanHandle(handle)
              ? `Others will say: talk to ${cleanHandle(handle)}'s supi`
              : "Connect ChatGPT as a plugin — no website needed."}
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
            Creates your hourly Airsup worker scheduled task immediately.
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
              Next — add plugin
            </button>
          </div>
        </>
      ) : null}

      {step === "plugin" && result ? (
        <>
          <h1>Add the Airsup plugin.</h1>
          <p className="setup-sub">
            This is a ChatGPT <strong>Developer Mode plugin</strong> (MCP), not a Custom GPT.
          </p>

          <ol className="setup-steps">
            <li>ChatGPT → Settings → enable <strong>Developer mode</strong></li>
            <li>ChatGPT → Plugins → <strong>+ New Plugin</strong></li>
            <li>
              Name: <strong>Airsup - {result.handle}</strong>
            </li>
            <li>
              Connection: <strong>Server URL</strong>
            </li>
            <li>Paste the Server URL below (token is already included)</li>
            <li>
              Authentication: <strong>None</strong> (not OAuth)
            </li>
            <li>Check “I understand…” → create</li>
            <li>In chat: Developer mode → enable Airsup plugin → say talk to konstantin&apos;s supi</li>
          </ol>

          <label className="setup-label">Server URL (paste into New Plugin)</label>
          <textarea className="setup-prompt" readOnly value={mcpUrl} rows={3} />
          <button
            type="button"
            className="setup-copy"
            onClick={() => void copy("plugin", mcpUrl)}
          >
            {copied === "plugin" ? "Copied" : "Copy Server URL"}
          </button>

          <p className="setup-sub">
            Do not use OAuth / Client ID / Auth URL. Auth = <strong>None</strong>, because your
            token is in the Server URL.
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
