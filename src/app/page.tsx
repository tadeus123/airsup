"use client";

import { useMemo, useState } from "react";

type Step = "domain" | "chatgpt" | "plugin";

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

export default function SetupPage() {
  const [step, setStep] = useState<Step>("domain");
  const [websiteDomain, setWebsiteDomain] = useState("");
  const [result, setResult] = useState<OnboardResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"token" | "plugin" | "prompt" | "">("");
  const [error, setError] = useState("");

  const handlePreview = useMemo(() => {
    const host = websiteDomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .replace(/^www\./, "");
    return host.split(".")[0] || "";
  }, [websiteDomain]);

  async function onDomainSubmit() {
    const domain = websiteDomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .replace(/^www\./, "");
    if (!domain) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ websiteDomain: domain }),
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
    <main className={`setup${step !== "domain" ? " setup-done" : ""}`}>
      {step === "domain" ? (
        <>
          <h1>Enter your domain.</h1>
          <p className="setup-sub">
            {handlePreview
              ? `Your Supi handle will be “${handlePreview}”. Others can say: talk to ${handlePreview}'s supi`
              : "No API key needed — next you’ll connect ChatGPT."}
          </p>
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

      {step === "chatgpt" && result ? (
        <>
          <h1>Connect ChatGPT.</h1>
          <p className="setup-sub">
            Opens ChatGPT with your hourly Airsup scanner prompt already filled in.
            Create a Scheduled Task that runs every hour with that prompt.
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
              Next — plugin URL
            </button>
          </div>
        </>
      ) : null}

      {step === "plugin" && result ? (
        <>
          <h1>Add the Airsup plugin.</h1>
          <p className="setup-sub">
            In ChatGPT, create a GPT / Actions and import this OpenAPI URL. Use your
            token as Bearer API key auth.
          </p>
          <label className="setup-label">Plugin URL</label>
          <textarea className="setup-prompt" readOnly value={result.pluginUrl} rows={2} />
          <button
            type="button"
            className="setup-copy"
            onClick={() => void copy("plugin", result.pluginUrl)}
          >
            {copied === "plugin" ? "Copied" : "Copy plugin URL"}
          </button>

          <label className="setup-label">Your API token</label>
          <textarea className="setup-prompt" readOnly value={result.token} rows={2} />
          <button
            type="button"
            className="setup-copy setup-copy-muted"
            onClick={() => void copy("token", result.token)}
          >
            {copied === "token" ? "Copied" : "Copy token"}
          </button>

          <ol className="setup-steps">
            {result.plugin.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>

          <p className="setup-sub">
            Then say in ChatGPT: <strong>talk to someone&apos;s supi</strong> — once
            they completed the same setup.
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
