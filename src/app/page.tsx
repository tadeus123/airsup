"use client";

import { useState } from "react";

type Step = "handle" | "plugin" | "schedule";

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
      setStep("plugin");
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

      {step === "plugin" && result ? (
        <>
          <h1>Add the Airsup plugin.</h1>
          <p className="setup-sub">
            Developer Mode MCP plugin first. Without it, the hourly task has no
            watch_endpoint / talk_to_supi tools and will die in ~1 minute.
          </p>
          <p className="setup-sub">
            Handle: <strong>{result.handle}</strong>
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
            <li>Paste the Server URL below (token included)</li>
            <li>
              Authentication: <strong>None</strong>
            </li>
            <li>Create → then continue to the hourly schedule</li>
          </ol>

          <label className="setup-label">Server URL</label>
          <textarea className="setup-prompt" readOnly value={mcpUrl} rows={3} />
          <button
            type="button"
            className="setup-copy"
            onClick={() => void copy("plugin", mcpUrl)}
          >
            {copied === "plugin" ? "Copied" : "Copy Server URL"}
          </button>

          <div className="setup-actions">
            <button
              type="button"
              className="setup-copy"
              onClick={() => setStep("schedule")}
            >
              Next — create hourly worker
            </button>
          </div>
        </>
      ) : null}

      {step === "schedule" && result ? (
        <>
          <h1>Create the hourly worker.</h1>
          <p className="setup-sub">
            Schedule: every hour. Each run must loop watch_endpoint (~25s) until
            next_action=finish (~58 minutes). Empty polls must not stop the run.
            Enable the Airsup plugin for this task.
          </p>
          <div className="setup-actions">
            <a
              className="setup-copy"
              href={result.chatgptUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open ChatGPT with schedule prompt
            </a>
            <button
              type="button"
              className="setup-copy setup-copy-muted"
              onClick={() => void copy("prompt", result.schedulePrompt)}
            >
              {copied === "prompt" ? "Copied prompt" : "Copy schedule prompt"}
            </button>
            <button
              type="button"
              className="setup-copy setup-copy-muted"
              onClick={() => void copy("prompt", result.schedulePrompt.replace(/^[\s\S]*BEGIN_INSTRUCTIONS\n/, "").replace(/\nEND_INSTRUCTIONS[\s\S]*$/, ""))}
            >
              {copied === "prompt" ? "Copied" : "Copy task instructions only"}
            </button>
            <button
              type="button"
              className="setup-copy setup-copy-muted"
              onClick={() => setStep("plugin")}
            >
              Back
            </button>
          </div>
        </>
      ) : null}

      {error ? <p className="err">{error}</p> : null}
    </main>
  );
}
