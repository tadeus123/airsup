export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmRoute = {
  provider: string;
  style: "openai" | "anthropic" | "google";
  baseUrl: string;
  model: string;
};

/**
 * Newest / strongest-understanding defaults per provider.
 * Env overrides (LLM_MODEL, OPENAI_MODEL, ANTHROPIC_MODEL, GOOGLE_MODEL) still win.
 */
export const FLAGSHIP_MODELS = {
  openai: "gpt-5.6",
  anthropic: "claude-fable-5",
  google: "gemini-3.1-pro-preview",
  groq: "openai/gpt-oss-120b",
  openrouter: "openai/gpt-5.6",
  xai: "grok-4.5",
  nvidia: "meta/llama-3.3-70b-instruct",
  deepseek: "deepseek-reasoner",
  compatible: "gpt-5.6",
} as const;

/**
 * Route an API key to the right chat API without any UI provider picker.
 * Known key prefixes map to native endpoints; anything else uses OpenAI-compatible
 * Chat Completions (override with LLM_BASE_URL / LLM_MODEL).
 * Defaults always prefer each provider's newest best-understanding model.
 */
export function resolveLlmRoute(apiKey: string): LlmRoute {
  const key = apiKey.trim();
  const envBase = (process.env.LLM_BASE_URL ?? "").trim().replace(/\/$/, "");
  const envModel = (
    process.env.LLM_MODEL ??
    process.env.OPENAI_MODEL ??
    ""
  ).trim();

  if (envBase) {
    const deepseek = /deepseek/i.test(envBase);
    return {
      provider: deepseek ? "deepseek" : "compatible",
      style: "openai",
      baseUrl: envBase,
      model:
        envModel ||
        (deepseek ? FLAGSHIP_MODELS.deepseek : FLAGSHIP_MODELS.compatible),
    };
  }

  if (key.startsWith("sk-ant-")) {
    return {
      provider: "anthropic",
      style: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model:
        envModel ||
        process.env.ANTHROPIC_MODEL?.trim() ||
        FLAGSHIP_MODELS.anthropic,
    };
  }

  if (key.startsWith("AIza")) {
    return {
      provider: "google",
      style: "google",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model:
        envModel || process.env.GOOGLE_MODEL?.trim() || FLAGSHIP_MODELS.google,
    };
  }

  if (key.startsWith("gsk_")) {
    return {
      provider: "groq",
      style: "openai",
      baseUrl: "https://api.groq.com/openai/v1",
      model: envModel || FLAGSHIP_MODELS.groq,
    };
  }

  if (key.startsWith("sk-or-")) {
    return {
      provider: "openrouter",
      style: "openai",
      baseUrl: "https://openrouter.ai/api/v1",
      model: envModel || FLAGSHIP_MODELS.openrouter,
    };
  }

  if (key.startsWith("xai-")) {
    return {
      provider: "xai",
      style: "openai",
      baseUrl: "https://api.x.ai/v1",
      model: envModel || FLAGSHIP_MODELS.xai,
    };
  }

  if (key.startsWith("nvapi-")) {
    return {
      provider: "nvidia",
      style: "openai",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      model: envModel || FLAGSHIP_MODELS.nvidia,
    };
  }

  // OpenAI and most OpenAI-compatible keys (DeepSeek, Together, Fireworks, …).
  // Set LLM_BASE_URL when the key is not for api.openai.com.
  return {
    provider: "openai",
    style: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: envModel || FLAGSHIP_MODELS.openai,
  };
}

export async function callChatLlm(
  apiKey: string,
  messages: ChatMessage[]
): Promise<{ text: string; provider: string }> {
  const route = resolveLlmRoute(apiKey);

  if (route.style === "anthropic") {
    const text = await callAnthropic(apiKey, route, messages);
    return { text, provider: route.provider };
  }
  if (route.style === "google") {
    const text = await callGoogle(apiKey, route, messages);
    return { text, provider: route.provider };
  }

  const text = await callOpenAiCompatible(apiKey, route, messages);
  return { text, provider: route.provider };
}

async function callOpenAiCompatible(
  apiKey: string,
  route: LlmRoute,
  messages: ChatMessage[]
): Promise<string> {
  const url = `${route.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  if (route.provider === "openrouter") {
    headers["http-referer"] = process.env.OPENROUTER_HTTP_REFERER || "https://airsup.app";
    headers["x-title"] = process.env.OPENROUTER_APP_TITLE || "Airsup";
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: route.model,
      messages,
    }),
  });

  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string } | string;
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!response.ok) {
    const err =
      typeof json.error === "string"
        ? json.error
        : json.error?.message || `${route.provider} HTTP ${response.status}`;
    throw new Error(err);
  }

  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${route.provider} returned an empty reply`);
  return text;
}

async function callAnthropic(
  apiKey: string,
  route: LlmRoute,
  messages: ChatMessage[]
): Promise<string> {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const chat = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  const response = await fetch(`${route.baseUrl.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: route.model,
      // Flagship Claude models use adaptive thinking; keep headroom for a real reply.
      max_tokens: 8192,
      ...(system ? { system } : {}),
      messages: chat,
    }),
  });

  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    content?: Array<{ type?: string; text?: string }>;
  };

  if (!response.ok) {
    throw new Error(json.error?.message || `anthropic HTTP ${response.status}`);
  }

  const text = json.content
    ?.filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("anthropic returned an empty reply");
  return text;
}

async function callGoogle(
  apiKey: string,
  route: LlmRoute,
  messages: ChatMessage[]
): Promise<string> {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const contents = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const url =
    `${route.baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(route.model)}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...(system
        ? { systemInstruction: { parts: [{ text: system }] } }
        : {}),
      contents,
    }),
  });

  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  if (!response.ok) {
    throw new Error(json.error?.message || `google HTTP ${response.status}`);
  }

  const text = json.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || "")
    .join("")
    .trim();
  if (!text) throw new Error("google returned an empty reply");
  return text;
}
