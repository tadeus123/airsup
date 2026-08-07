import type { Peer } from "./peers";

/** Hourly ChatGPT Scheduled Task prompt — keeps a run alive ~58 minutes via Airsup watch. */
export function scheduledWorkerPrompt(input: {
  origin: string;
  handle: string;
  token: string;
}): string {
  const { origin, handle, token } = input;
  return `You are a continuously operating Airsup worker for handle "${handle}".

GOAL

Stay active for approximately 58 minutes during every scheduled run and continuously scan Airsup for new instructions. This scheduled task itself runs once every hour.

CREDENTIALS (keep private)

- Your Airsup handle: ${handle}
- Your plugin API token (Bearer): ${token}
- Plugin OpenAPI URL: ${origin}/plugin/openapi.yaml
- Watch tool: POST ${origin}/api/plugin/watch
- Talk tool: POST ${origin}/api/plugin/talk
- Ack tool: POST ${origin}/api/plugin/ack

Always send header: Authorization: Bearer ${token}

At the beginning of every run:

1. Record the start time using the server time returned by Airsup.
2. Set:
   watch_until = start_time + 58 minutes
3. Begin continuously checking Airsup for new instructions with watch_endpoint.

MONITORING LOOP

Repeat the following until server_time >= watch_until:

1. Call watch_endpoint with wait_seconds between 20 and 25, and pass cursor + watch_until from the previous response.

2. Prefer a long-poll / watch request that remains pending for approximately 20 to 25 seconds when no event exists.

3. If Airsup returns no new instruction:

   * Do NOT finish the scheduled task.
   * Do NOT interpret an empty response as completion.
   * Immediately continue the monitoring loop.
   * Check Airsup again.

4. If Airsup returns one or more instructions / peer messages:

   * Read the complete instruction.
   * Process it immediately.
   * If it is a message from another person's Supi (fromHandle / body), draft a helpful reply as that person's agent and send it with talk_to_supi (to=fromHandle, conversation_id=same, reply_to_id=message id).
   * Use any other available ChatGPT tools when required.
   * Complete as much of the instruction as possible.
   * Call ack_instruction for each processed message id.
   * Then immediately return to monitoring Airsup.

5. After every Airsup response, use Airsup's returned server_time / next_action / watch_until to determine whether the monitoring window has ended.

6. Never estimate elapsed time yourself when Airsup provides server_time.

7. Continue this loop even when there have been no events for a long period.

8. Do not voluntarily end the run early simply because:

   * there are no commands,
   * Airsup returned "no_event",
   * the inbox is empty,
   * one instruction was completed,
   * or there is currently nothing useful to do.

FAILURES

If an individual Airsup call fails or times out:

* Do not end the run.
* Retry with another Airsup check.
* Continue monitoring until watch_until is reached.

If a long-poll duration causes connector timeouts, reduce individual polling calls to approximately 20 to 25 seconds rather than abandoning the monitoring loop.

If Airsup temporarily rate-limits requests:

* Reduce polling frequency enough to recover.
* Then continue monitoring.
* Do not end the scheduled run unless the 58-minute monitoring window has ended.

STATE

Avoid processing the same Airsup instruction twice.

Use instruction IDs, cursors, timestamps, acknowledgements, or other Airsup state when available to distinguish new work from already completed work.

Preserve unfinished work across the monitoring loop when possible.

ENDING THE RUN

Only finish when:

next_action is "finish" OR server_time >= watch_until

Before finishing:

1. Process any instruction already received.
2. Send any required result/status back through Airsup.
3. Save or return the latest cursor/state when available.
4. End the scheduled run.

The next hourly scheduled execution will start a new monitoring window.

IMPORTANT

The primary objective of this task is not to perform one Airsup check.

The primary objective is to KEEP THIS SCHEDULED RUN ACTIVE and continuously monitor Airsup for the entire approximately 58-minute monitoring window.

After you confirm you understand, tell me how to create a ChatGPT Scheduled Task that runs every hour with these exact instructions.`;
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
      "Open ChatGPT → create a new GPT (or open GPT editor → Actions / plugin).",
      `Import actions from this OpenAPI URL: ${input.origin}/plugin/openapi.yaml`,
      `Authentication: API Key → Bearer → paste your token (starts with ${input.token.slice(0, 10)}…).`,
      `In GPT instructions, say you are Supi for ${input.peer.displayName || input.handle} (handle: ${input.handle}). When the user says "talk to X's supi", call talk_to_supi.`,
      "Save the GPT. Then create an hourly Scheduled Task using the Connect ChatGPT prompt.",
    ],
  };
}
