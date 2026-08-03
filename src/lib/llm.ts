import type { AgentToolDefinition } from "./google-tools";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
};

export type LlmRoute = {
  provider: string;
  style: "openai" | "anthropic" | "google";
  baseUrl: string;
  model: string;
};

export type LlmToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type LlmChatResult = {
  text: string;
  provider: string;
  toolCalls?: LlmToolCall[];
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

  return {
    provider: "openai",
    style: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: envModel || FLAGSHIP_MODELS.openai,
  };
}

export async function callChatLlm(
  apiKey: string,
  messages: ChatMessage[],
  tools?: AgentToolDefinition[]
): Promise<LlmChatResult> {
  const route = resolveLlmRoute(apiKey);

  if (route.style === "anthropic") {
    return callAnthropic(apiKey, route, messages, tools);
  }
  if (route.style === "google") {
    return callGoogle(apiKey, route, messages, tools);
  }

  return callOpenAiCompatible(apiKey, route, messages, tools);
}

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function callOpenAiCompatible(
  apiKey: string,
  route: LlmRoute,
  messages: ChatMessage[],
  tools?: AgentToolDefinition[]
): Promise<LlmChatResult> {
  const url = `${route.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  if (route.provider === "openrouter") {
    headers["http-referer"] = process.env.OPENROUTER_HTTP_REFERER || "https://airsup.app";
    headers["x-title"] = process.env.OPENROUTER_APP_TITLE || "Airsup";
  }

  const openaiMessages = messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool" as const,
        tool_call_id: m.toolCallId || "",
        content: m.content,
      };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant" as const,
        content: m.content || null,
        tool_calls: m.toolCalls.map((t) => ({
          id: t.id,
          type: "function" as const,
          function: { name: t.name, arguments: t.arguments },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });

  const body: Record<string, unknown> = {
    model: route.model,
    messages: openaiMessages,
  };
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
    body.tool_choice = "auto";
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string } | string;
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
  };

  if (!response.ok) {
    const err =
      typeof json.error === "string"
        ? json.error
        : json.error?.message || `${route.provider} HTTP ${response.status}`;
    throw new Error(err);
  }

  const message = json.choices?.[0]?.message;
  const toolCalls = (message?.tool_calls || [])
    .filter((t) => t.id && t.function?.name)
    .map((t) => ({
      id: t.id!,
      name: t.function!.name!,
      arguments: parseToolArgs(t.function?.arguments || "{}"),
    }));

  if (toolCalls.length) {
    return {
      text: (message?.content || "").trim(),
      provider: route.provider,
      toolCalls,
    };
  }

  const text = message?.content?.trim();
  if (!text) throw new Error(`${route.provider} returned an empty reply`);
  return { text, provider: route.provider };
}

async function callAnthropic(
  apiKey: string,
  route: LlmRoute,
  messages: ChatMessage[],
  tools?: AgentToolDefinition[]
): Promise<LlmChatResult> {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  type AnthropicBlock =
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    | { type: "tool_result"; tool_use_id: string; content: string };

  const chat: Array<{ role: "user" | "assistant"; content: string | AnthropicBlock[] }> = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      const last = chat[chat.length - 1];
      const block: AnthropicBlock = {
        type: "tool_result",
        tool_use_id: m.toolCallId || "",
        content: m.content,
      };
      if (last?.role === "user" && Array.isArray(last.content)) {
        last.content.push(block);
      } else {
        chat.push({ role: "user", content: [block] });
      }
      continue;
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      const blocks: AnthropicBlock[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const t of m.toolCalls) {
        blocks.push({
          type: "tool_use",
          id: t.id,
          name: t.name,
          input: parseToolArgs(t.arguments),
        });
      }
      chat.push({ role: "assistant", content: blocks });
      continue;
    }
    if (m.role === "user" || m.role === "assistant") {
      chat.push({ role: m.role, content: m.content });
    }
  }

  const response = await fetch(`${route.baseUrl.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: route.model,
      max_tokens: 8192,
      ...(system ? { system } : {}),
      messages: chat,
      ...(tools?.length
        ? {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters,
            })),
          }
        : {}),
    }),
  });

  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    content?: Array<{
      type?: string;
      text?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };

  if (!response.ok) {
    throw new Error(json.error?.message || `anthropic HTTP ${response.status}`);
  }

  const toolCalls = (json.content || [])
    .filter((b) => b.type === "tool_use" && b.id && b.name)
    .map((b) => ({
      id: b.id!,
      name: b.name!,
      arguments: b.input || {},
    }));

  const text = (json.content || [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("")
    .trim();

  if (toolCalls.length) {
    return { text, provider: route.provider, toolCalls };
  }
  if (!text) throw new Error("anthropic returned an empty reply");
  return { text, provider: route.provider };
}

async function callGoogle(
  apiKey: string,
  route: LlmRoute,
  messages: ChatMessage[],
  tools?: AgentToolDefinition[]
): Promise<LlmChatResult> {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  type GeminiPart =
    | { text: string }
    | { functionCall: { name: string; args?: Record<string, unknown> } }
    | {
        functionResponse: {
          name: string;
          response: Record<string, unknown>;
        };
      };

  const contents: Array<{ role: string; parts: GeminiPart[] }> = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      let responseObj: Record<string, unknown> = { result: m.content };
      try {
        const parsed = JSON.parse(m.content) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          responseObj = parsed as Record<string, unknown>;
        }
      } catch {
        // keep wrapped string
      }
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: m.toolCallId || "tool",
              response: responseObj,
            },
          },
        ],
      });
      continue;
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      const parts: GeminiPart[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const t of m.toolCalls) {
        parts.push({
          functionCall: {
            name: t.name,
            args: parseToolArgs(t.arguments),
          },
        });
      }
      contents.push({ role: "model", parts });
      continue;
    }
    if (m.role === "user" || m.role === "assistant") {
      contents.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      });
    }
  }

  const url =
    `${route.baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(route.model)}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      ...(tools?.length
        ? {
            tools: [
              {
                functionDeclarations: tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parameters: t.parameters,
                })),
              },
            ],
          }
        : {}),
    }),
  });

  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          functionCall?: { name?: string; args?: Record<string, unknown> };
        }>;
      };
    }>;
  };

  if (!response.ok) {
    throw new Error(json.error?.message || `google HTTP ${response.status}`);
  }

  const parts = json.candidates?.[0]?.content?.parts || [];
  const toolCalls = parts
    .filter((p) => p.functionCall?.name)
    .map((p) => ({
      id: p.functionCall!.name!,
      name: p.functionCall!.name!,
      arguments: p.functionCall!.args || {},
    }));

  const text = parts
    .map((p) => p.text || "")
    .join("")
    .trim();

  if (toolCalls.length) {
    return { text, provider: route.provider, toolCalls };
  }
  if (!text) throw new Error("google returned an empty reply");
  return { text, provider: route.provider };
}
