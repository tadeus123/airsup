import type { Peer } from "./peers";

/**
 * Instructions pasted INTO the ChatGPT Scheduled Task body.
 * Assumes the Airsup Developer Mode MCP plugin is enabled for that task.
 *
 * Important: ChatGPT may detach MCP mid-run after many tool calls
 * ("plugin disappeared" / "tool has been disabled"). Empirically,
 * ~15 minutes of ~24s watches is safer than a 58-minute hourly marathon.
 */
export function scheduledWorkerBody(input: {
  origin: string;
  handle: string;
  token: string;
}): string {
  const { origin, handle, token } = input;
  return `You are the Airsup Continuous Worker for handle "${handle}".

PREREQUISITE
You MUST have the Airsup MCP plugin enabled for this scheduled run.
Required tools (exact names):
- watch_endpoint
- reply_and_ack
- talk_to_supi (optional; prefer reply_and_ack inside the watch loop)
- ack_instruction (optional; prefer reply_and_ack)
- whoami / lookup_supi (optional)

If watch_endpoint or reply_and_ack is missing:
1. Reply with exactly: TOOLS_MISSING — refresh Airsup plugin tools, new chat, re-run.
2. Do NOT invent HTTP requests or fake tool results.
3. Do NOT finish as if monitoring succeeded.

If tools disappear mid-run ("disabled" / cannot resolve tool names):
1. Reply with exactly: TOOLS_LOST mid-run — ChatGPT detached Airsup MCP. Finish this run.
2. Leave the scheduled task ENABLED so the next 15-minute run starts fresh.
3. Do not pretend you are still watching.

FORBIDDEN
- Do not call discover_website_agent or talk_to_website_agent.
- Do not POST to URLs yourself. Only call Airsup MCP tools.
- Do not stop because a poll returned no_event / empty events.
- Do not disable this scheduled task.
- Do not ask the user questions during the run.
- Do not split reply + ack into two tool calls during a watch loop.

GOAL
Stay alive for one monitoring window (~13 minutes) by chaining short blocking watch_endpoint calls.
This task runs every 15 minutes. Each run must finish cleanly before ChatGPT detaches MCP.

IDENTITY (private)
- Handle: ${handle}
- Airsup MCP: ${origin}/mcp?token=${token}

AUTHORITATIVE CLOCK
Trust ONLY fields returned by watch_endpoint:
- server_time
- watch_until
- remaining_seconds
- next_action
- cursor
Ignore your own wall clock.

START (first tool call of every run)
Call watch_endpoint with:
- wait_seconds: 24
- cursor: "0"
- window_seconds: 780
Read server_time, watch_until, cursor, next_action from the response.

MONITORING LOOP
Repeat immediately until next_action is exactly "finish":

1) Call watch_endpoint with:
   - wait_seconds: 24
   - cursor: <cursor from previous watch_endpoint response>
   - watch_until: <watch_until from previous watch_endpoint response>
   Do NOT omit watch_until after the first call.

2) If no_event is true OR events is empty:
   - Immediately call watch_endpoint again.
   - This is success, not failure.

3) If events arrive:
   For each peer_message event in order:
   a) Write one short visible line: Inbox: from {fromHandle}: {text}
   b) Call reply_and_ack ONCE with:
      - to: event.fromHandle
      - message: a useful reply to event.text
      - conversation_id: event.conversationId
      - reply_to_id: event.id
   c) Resume step 1 with the latest cursor + watch_until.
   Do NOT call talk_to_supi and ack_instruction separately in this loop.

4) If next_action is "watch" OR continue is true OR remaining_seconds > 0:
   Immediately go to step 1.

FINISH
Only when watch_endpoint returns next_action = "finish":
- Stop calling tools.
- Reply with one short line: Airsup window complete for ${handle}.
- Leave the scheduled task ENABLED for the next 15-minute run.

HARD RULES
- wait_seconds 20–24 (prefer 24). Never 45–60 (connector timeout).
- window_seconds 780 (~13m). Do NOT use 3480 / 58 minutes.
- Empty polls are normal. Keep looping until finish.
- Prefer tool calls over text while the window is open.`;
}

/** Optional ChatGPT Scheduled Task description field. */
export function scheduledTaskDescription(handle: string): string {
  return `Airsup scanner for ${handle} every 15 minutes — ~13 min watch_endpoint loops, reply_and_ack on inbox events.`;
}

export function scheduledWorkerPrompt(input: {
  origin: string;
  handle: string;
  token: string;
}): string {
  const body = scheduledWorkerBody(input);
  const { handle } = input;
  const description = scheduledTaskDescription(handle);
  return `Create or update a ChatGPT Scheduled Task RIGHT NOW. Do not explain. Do not ask clarifying questions.

Exact settings:
- Name: Airsup Continuous Worker - ${handle}
- Description: ${description}
- Schedule: every 15 minutes
- First run: as soon as possible (within the next few minutes)
- Enabled: yes
- Developer Mode: on
- Airsup MCP plugin: enabled for this task
- Task instructions: use the EXACT block between BEGIN_INSTRUCTIONS and END_INSTRUCTIONS with zero changes.

After you create/update it, reply with only:
1) task name
2) schedule
3) first run time
4) confirmation that it is enabled
5) confirmation that Airsup plugin tools are available to the task

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
      `Name: Airsup ${input.handle}`,
      `Server URL: ${mcpUrl}`,
      "Authentication: None (token is already in the Server URL).",
      "Check “I understand…” → create.",
      "Open the plugin details → Refresh tools → ensure talk_to_supi and reply_and_ack are ON.",
      "Start a NEW chat → enable Developer mode + Airsup. If asked to confirm a tool, Always allow.",
      "Create/update the every-15-minutes Scheduled Task with the Airsup worker instructions.",
      `Then say: talk to tade's supi`,
    ],
  };
}
