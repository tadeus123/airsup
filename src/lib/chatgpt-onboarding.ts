import type { Peer } from "./peers";

/** Worker instructions used INSIDE the Scheduled Task. */
export function scheduledWorkerBody(input: {
  origin: string;
  handle: string;
  token: string;
}): string {
  const { origin, handle, token } = input;
  return `You are a continuously operating Airsup worker for handle "${handle}".

GOAL
Stay active ~58 minutes each hourly run and continuously scan Airsup for new peer messages using the Airsup MCP plugin tools.

CREDENTIALS (keep private)
- Handle: ${handle}
- MCP Server URL: ${origin}/mcp?token=${token}

TOOLS (from the Airsup plugin — use these names exactly)
- whoami
- lookup_supi
- talk_to_supi
- watch_endpoint
- ack_instruction

At the beginning of every run:
1. Call watch_endpoint (wait_seconds 20-25) and read server_time + watch_until.
2. If needed, first call may pass window_seconds=3480.

MONITORING LOOP — until next_action is "finish":
1. Call watch_endpoint with wait_seconds 20-25, cursor, and watch_until from the previous response.
2. If no_event: do NOT finish. Immediately call watch_endpoint again.
3. If events arrive: process them. For peer messages, reply with talk_to_supi (to=fromHandle, same conversation_id, reply_to_id=id), then ack_instruction, then resume watching.
4. Trust Airsup server_time / remaining_seconds / watch_until.

Only finish when next_action is "finish".`;
}

export function scheduledWorkerPrompt(input: {
  origin: string;
  handle: string;
  token: string;
}): string {
  const body = scheduledWorkerBody(input);
  const { handle } = input;
  return `Create a ChatGPT Scheduled Task RIGHT NOW. Do not explain. Do not ask clarifying questions.

Exact settings:
- Name: Airsup Continuous Worker - ${handle}
- Schedule: every hour
- First run: as soon as possible (within the next few minutes)
- Enabled: yes
- Task instructions: use the EXACT block between BEGIN_INSTRUCTIONS and END_INSTRUCTIONS with zero changes.

After you create it, reply with only:
1) task name
2) schedule
3) first run time
4) confirmation that it is enabled

BEGIN_INSTRUCTIONS
${body}
END_INSTRUCTIONS`;
}

export function chatgptPrefillUrl(prompt: string): string {
  return `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
}

export function pluginSetupInstructions(input: {
  origin: string;
  handle: string;
  token: string;
  peer: Peer;
}): {
  openapiUrl: string;
  mcpUrl: string;
  authHeader: string;
  token: string;
  handle: string;
  steps: string[];
} {
  const mcpUrl = `${input.origin}/mcp?token=${input.token}`;
  return {
    openapiUrl: `${input.origin}/plugin/openapi.yaml`,
    mcpUrl,
    authHeader: "Bearer",
    token: input.token,
    handle: input.handle,
    steps: [
      "ChatGPT → Settings → turn on Developer mode.",
      "ChatGPT → Plugins → + New Plugin (Developer mode app).",
      `Name: Airsup - ${input.handle}`,
      `Server URL: ${mcpUrl}`,
      "Authentication: None (token is already in the Server URL).",
      "Check “I understand…” → create.",
      "In a chat, enable Developer mode and select the Airsup plugin.",
      `Then say: talk to konstantin's supi`,
    ],
  };
}
