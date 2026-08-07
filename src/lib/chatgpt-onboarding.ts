import type { Peer } from "./peers";

/** Worker instructions used INSIDE the Scheduled Task (no "how to create" waffle). */
export function scheduledWorkerBody(input: {
  origin: string;
  handle: string;
  token: string;
}): string {
  const { origin, handle, token } = input;
  return `You are a continuously operating Airsup worker for handle "${handle}".

GOAL
Stay active for approximately 58 minutes during every scheduled run and continuously scan Airsup for new instructions. This scheduled task runs once every hour.

CREDENTIALS (keep private)
- Airsup handle: ${handle}
- Bearer token: ${token}
- OpenAPI / Actions schema URL: ${origin}/plugin/openapi.yaml
- watch_endpoint: POST ${origin}/api/plugin/watch
- talk_to_supi: POST ${origin}/api/plugin/talk
- ack_instruction: POST ${origin}/api/plugin/ack

Always send header: Authorization: Bearer ${token}

At the beginning of every run:
1. Record start time from Airsup server_time.
2. Set watch_until = start_time + 58 minutes.
3. Begin continuously calling watch_endpoint.

MONITORING LOOP — repeat until next_action is "finish" OR server_time >= watch_until:
1. Call watch_endpoint with wait_seconds 20-25, plus cursor and watch_until from the previous response.
2. If no_event: do NOT finish. Immediately call watch_endpoint again.
3. If events arrive: process them. For peer messages, reply with talk_to_supi (to=fromHandle, same conversation_id, reply_to_id=message id), then ack_instruction for each id, then resume watching.
4. Trust Airsup server_time / remaining_seconds / watch_until. Never guess elapsed time.
5. Do not end early because the inbox is empty.

FAILURES
On timeout/error/rate-limit: retry watch_endpoint. Keep going until watch_until.

ENDING
Only finish when next_action is "finish" or server_time >= watch_until. Then end the run.`;
}

/**
 * Prefill prompt for Connect ChatGPT — must CREATE the schedule immediately, not explain how.
 */
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
  authHeader: string;
  token: string;
  handle: string;
  steps: string[];
} {
  return {
    openapiUrl: `${input.origin}/plugin/openapi.yaml`,
    authHeader: "Bearer",
    token: input.token,
    handle: input.handle,
    steps: [
      "WRONG place: ChatGPT “New Plugin” / MCP connector with OAuth. Close that.",
      "RIGHT place: ChatGPT → create a GPT → Configure → Actions → Create new action.",
      `In Actions, click “Import from URL” and paste: ${input.origin}/plugin/openapi.yaml`,
      "Authentication dropdown: choose “API Key” (NOT OAuth).",
      "Auth Type: Bearer.",
      `API Key field: paste your full token starting with ${input.token.slice(0, 10)}…`,
      `GPT instructions: You are Supi for ${input.peer.displayName || input.handle} (handle ${input.handle}). When asked to talk to someone's supi, call talk_to_supi.`,
      "Save the GPT. Use this GPT (or its Actions) when chatting / in the scheduled worker.",
    ],
  };
}
