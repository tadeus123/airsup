"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Step = "domain" | "model" | "prompt" | "ready" | "admin";

type ModelOption = {
  id: string;
  name: string;
  detail: string;
  group: string;
};

type Integration = {
  id: string;
  name: string;
  blurb: string;
};

type ContextItem = {
  id: string;
  kind: "website" | "business" | "personal" | "other";
  title: string;
  body: string;
  source: "auto" | "manual";
  at: string;
};

const MODELS: ModelOption[] = [
  { id: "auto", name: "Auto", detail: "Balanced · picks for you", group: "Suggested" },
  { id: "composer-2", name: "Composer 2", detail: "Agentic coding", group: "Suggested" },
  { id: "claude-opus-4", name: "Claude Opus 4", detail: "Anthropic · deepest reasoning", group: "Anthropic" },
  { id: "claude-sonnet-4", name: "Claude Sonnet 4", detail: "Anthropic · fast & sharp", group: "Anthropic" },
  { id: "gpt-5.4", name: "GPT-5.4", detail: "OpenAI · general", group: "OpenAI" },
  { id: "gpt-5-mini", name: "GPT-5 mini", detail: "OpenAI · cheaper / quicker", group: "OpenAI" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", detail: "Google · long context", group: "Google" },
  { id: "grok-4", name: "Grok 4", detail: "xAI", group: "Other" },
];

const INTEGRATIONS: Integration[] = [
  { id: "gcal", name: "Google Calendar", blurb: "Availability & meetings" },
  { id: "gmail", name: "Gmail", blurb: "Read & draft mail" },
  { id: "gdrive", name: "Google Drive", blurb: "Docs, sheets, files" },
  { id: "slack", name: "Slack", blurb: "Channels & DMs" },
  { id: "notion", name: "Notion", blurb: "Pages & databases" },
  { id: "github", name: "GitHub", blurb: "Repos & issues" },
  { id: "stripe", name: "Stripe", blurb: "Payments & customers" },
  { id: "hubspot", name: "HubSpot", blurb: "CRM & pipeline" },
  { id: "whatsapp", name: "WhatsApp", blurb: "Business messaging" },
  { id: "linkedin", name: "LinkedIn", blurb: "Profile & outreach" },
];

const WEBSITE_SEED: Omit<ContextItem, "id" | "at">[] = [
  {
    kind: "website",
    title: "Homepage",
    body: "Hero, offer, and primary CTA crawled from /",
    source: "auto",
  },
  {
    kind: "website",
    title: "About / services",
    body: "Service descriptions, pricing hints, and positioning from public pages",
    source: "auto",
  },
  {
    kind: "website",
    title: "Contact & tone",
    body: "Contact paths, voice, and FAQs inferred from site copy",
    source: "auto",
  },
];

function nowIso() {
  return new Date().toISOString();
}

function ModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = MODELS.find((m) => m.id === value) ?? MODELS[0];

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, ModelOption[]>();
    for (const m of MODELS) {
      const list = map.get(m.group) ?? [];
      list.push(m);
      map.set(m.group, list);
    }
    return [...map.entries()];
  }, []);

  return (
    <div className="model-picker" ref={rootRef}>
      <button
        type="button"
        className="model-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="model-trigger-main">
          <span className="model-trigger-label">Model</span>
          <span className="model-trigger-name">{selected.name}</span>
        </span>
        <span className="model-trigger-meta">{selected.detail}</span>
        <span className="model-chevron" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div className="model-menu" role="listbox" aria-label="Select model">
          {groups.map(([group, items]) => (
            <div key={group} className="model-group">
              <div className="model-group-label">{group}</div>
              {items.map((m) => {
                const active = m.id === value;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`model-option${active ? " is-active" : ""}`}
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                  >
                    <span className="model-option-text">
                      <span className="model-option-name">{m.name}</span>
                      <span className="model-option-detail">{m.detail}</span>
                    </span>
                    {active ? <span className="model-check">✓</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AuthOverlay({
  integration,
  onClose,
  onDone,
}: {
  integration: Integration;
  onClose: () => void;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<"consent" | "working" | "done">("consent");
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (phase !== "working") return;
    const t = setTimeout(() => {
      setPhase("done");
      doneRef.current();
    }, 1100);
    return () => clearTimeout(t);
  }, [phase]);

  return (
    <div className="oauth-backdrop" role="dialog" aria-modal="true" aria-label="Connect integration">
      <div className="oauth-window">
        <div className="oauth-chrome">
          <span className="oauth-dot" />
          <span className="oauth-dot" />
          <span className="oauth-dot" />
          <span className="oauth-title">Sign in to continue</span>
        </div>
        <div className="oauth-body">
          {phase === "consent" ? (
            <>
              <p className="oauth-app">Airsup wants to access</p>
              <h2>{integration.name}</h2>
              <p className="oauth-blurb">{integration.blurb} · mock OAuth only</p>
              <ul className="oauth-scopes">
                <li>View basic account info</li>
                <li>Read relevant data for your agent</li>
                <li>Act only when you approve</li>
              </ul>
              <div className="oauth-actions">
                <button type="button" className="btn-ghost" onClick={onClose}>
                  Cancel
                </button>
                <button type="button" className="btn-accent" onClick={() => setPhase("working")}>
                  Allow
                </button>
              </div>
            </>
          ) : null}
          {phase === "working" ? (
            <p className="oauth-status">Connecting {integration.name}…</p>
          ) : null}
          {phase === "done" ? (
            <>
              <p className="oauth-status ok">Connected</p>
              <button type="button" className="btn-accent" onClick={onClose}>
                Done
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function TestMockupPage() {
  const [step, setStep] = useState<Step>("domain");
  const [websiteDomain, setWebsiteDomain] = useState("");
  const [modelId, setModelId] = useState("claude-sonnet-4");
  const [prompt, setPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [authTarget, setAuthTarget] = useState<Integration | null>(null);
  const [contexts, setContexts] = useState<ContextItem[]>([]);
  const [ctxKind, setCtxKind] = useState<ContextItem["kind"]>("business");
  const [ctxTitle, setCtxTitle] = useState("");
  const [ctxBody, setCtxBody] = useState("");
  const [crawlBusy, setCrawlBusy] = useState(false);

  const modelName = MODELS.find((m) => m.id === modelId)?.name ?? modelId;
  const domainLabel = websiteDomain.trim() || "your-domain.com";

  function buildPrompt(domain: string, model: string) {
    return `Connect this website (${domain}) to Airsup / Supi.

Use model preference: ${model}.

Invariants:
- Zero human-visible artefacts on existing pages (no logo, button, badge, chat widget, nav/footer link)
- Maximum machine discovery: agent-card, agent.json, llms.txt, agent-sitemap, Link headers, head <link>s, robots/sitemap allows, /agent/chat
- /supi may be proxied for crawlers — do not link it from homepage/nav
- Do not break the existing website

Implement the discovery wiring only. Keep structure and design unchanged.`;
  }

  function openAdmin() {
    setCrawlBusy(true);
    setTimeout(() => {
      setContexts((prev) => {
        if (prev.some((c) => c.source === "auto")) return prev;
        return WEBSITE_SEED.map((seed, i) => ({
          ...seed,
          id: `auto-${i}`,
          at: nowIso(),
        }));
      });
      setCrawlBusy(false);
      setStep("admin");
    }, 700);
  }

  function addContext() {
    if (!ctxTitle.trim() || !ctxBody.trim()) return;
    setContexts((prev) => [
      {
        id: `manual-${Date.now()}`,
        kind: ctxKind,
        title: ctxTitle.trim(),
        body: ctxBody.trim(),
        source: "manual",
        at: nowIso(),
      },
      ...prev,
    ]);
    setCtxTitle("");
    setCtxBody("");
  }

  function removeContext(id: string) {
    setContexts((prev) => prev.filter((c) => c.id !== id));
  }

  if (step === "admin") {
    return (
      <main className="test-admin">
        <header className="test-admin-top">
          <div>
            <p className="test-kicker">Airsup · mockup</p>
            <h1>{domainLabel}</h1>
            <p className="test-sub">
              Personal admin · model {modelName}
              {crawlBusy ? " · indexing site…" : ""}
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={() => setStep("ready")}>
            ← Back
          </button>
        </header>

        <div className="test-admin-grid">
          <section className="test-context">
            <div className="test-section-head">
              <h2>Agent context</h2>
              <p>Everything Supi knows for this domain. Website pages are stored first; add anything else.</p>
            </div>

            <div className="ctx-composer">
              <div className="ctx-composer-row">
                <select
                  value={ctxKind}
                  onChange={(e) => setCtxKind(e.target.value as ContextItem["kind"])}
                  aria-label="Context type"
                >
                  <option value="business">Business</option>
                  <option value="personal">Personal</option>
                  <option value="website">Website</option>
                  <option value="other">Other</option>
                </select>
                <input
                  type="text"
                  placeholder="Short title"
                  value={ctxTitle}
                  onChange={(e) => setCtxTitle(e.target.value)}
                />
              </div>
              <textarea
                placeholder="Paste notes, policies, offers, tone, constraints…"
                value={ctxBody}
                onChange={(e) => setCtxBody(e.target.value)}
                rows={4}
              />
              <button type="button" className="btn-accent" onClick={addContext}>
                Add context
              </button>
            </div>

            <div className="ctx-list">
              {contexts.length === 0 ? (
                <p className="test-empty">No context yet. Site crawl will appear here.</p>
              ) : (
                contexts.map((c) => (
                  <article key={c.id} className="ctx-card">
                    <div className="ctx-card-top">
                      <div>
                        <span className={`ctx-kind ${c.kind}`}>{c.kind}</span>
                        {c.source === "auto" ? <span className="ctx-auto">auto</span> : null}
                        <strong>{c.title}</strong>
                      </div>
                      {c.source === "manual" ? (
                        <button type="button" className="ctx-remove" onClick={() => removeContext(c.id)}>
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <p>{c.body}</p>
                  </article>
                ))
              )}
            </div>
          </section>

          <aside className="test-integrations">
            <div className="test-section-head">
              <h2>Connections</h2>
              <p>Gray = not connected. Click to run the usual auth flow.</p>
            </div>
            <ul className="integ-list">
              {INTEGRATIONS.map((item) => {
                const on = Boolean(connected[item.id]);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`integ-btn${on ? " is-on" : " is-off"}`}
                      onClick={() => {
                        if (on) {
                          setConnected((prev) => ({ ...prev, [item.id]: false }));
                          return;
                        }
                        setAuthTarget(item);
                      }}
                    >
                      <span className="integ-name">{item.name}</span>
                      <span className="integ-blurb">{item.blurb}</span>
                      <span className="integ-state">{on ? "Connected" : "Connect"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>

        {authTarget ? (
          <AuthOverlay
            integration={authTarget}
            onClose={() => setAuthTarget(null)}
            onDone={() => {
              setConnected((prev) => ({ ...prev, [authTarget.id]: true }));
            }}
          />
        ) : null}
      </main>
    );
  }

  return (
    <main className={`setup test-setup${step === "ready" ? " setup-done" : ""}`}>
      {step === "domain" ? (
        <>
          <p className="test-kicker">Airsup · /test mockup</p>
          <h1>Enter your domain.</h1>
          <form
            className="setup-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!websiteDomain.trim()) return;
              setStep("model");
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

      {step === "model" ? (
        <>
          <p className="test-kicker">{domainLabel}</p>
          <h1>Select your model.</h1>
          <p className="setup-sub">Same idea as Cursor — pick how Supi thinks for this site.</p>
          <div className="test-model-wrap">
            <ModelPicker value={modelId} onChange={setModelId} />
            <button
              type="button"
              className="btn-accent test-continue"
              onClick={() => {
                setPrompt(buildPrompt(domainLabel, modelName));
                setStep("prompt");
              }}
            >
              Continue
            </button>
          </div>
          <button type="button" className="test-back" onClick={() => setStep("domain")}>
            ← Domain
          </button>
        </>
      ) : null}

      {step === "prompt" ? (
        <>
          <p className="test-kicker">
            {domainLabel} · {modelName}
          </p>
          <h1>Paste this into Cursor.</h1>
          <p className="setup-sub">
            Website install prompt for {domainLabel}. Additive only — do not break the existing site.
          </p>
          <textarea
            className="setup-prompt"
            readOnly
            value={prompt || buildPrompt(domainLabel, modelName)}
            onFocus={() => {
              if (!prompt) setPrompt(buildPrompt(domainLabel, modelName));
            }}
          />
          <div className="test-actions">
            <button
              type="button"
              className="setup-copy"
              onClick={async () => {
                const text = prompt || buildPrompt(domainLabel, modelName);
                setPrompt(text);
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
                setStep("ready");
              }}
            >
              {copied ? "Copied" : "Copy prompt"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setPrompt(buildPrompt(domainLabel, modelName));
                setStep("ready");
              }}
            >
              Skip copy
            </button>
          </div>
          <button type="button" className="test-back" onClick={() => setStep("model")}>
            ← Model
          </button>
        </>
      ) : null}

      {step === "ready" ? (
        <>
          <p className="test-kicker">
            {domainLabel} · {modelName}
          </p>
          <h1>You&apos;re set.</h1>
          <p className="setup-sub">
            Prompt ready for the website project. Open your personal admin for this domain when you want
            connections and context.
          </p>
          <div className="test-actions">
            <button type="button" className="setup-copy" onClick={openAdmin}>
              Open admin panel
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={async () => {
                const text = prompt || buildPrompt(domainLabel, modelName);
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy prompt again"}
            </button>
          </div>
          <button type="button" className="test-back" onClick={() => setStep("prompt")}>
            ← Prompt
          </button>
        </>
      ) : null}
    </main>
  );
}
