import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ackMessage,
  getPeerByHandle,
  normalizeHandle,
  readInboxAfter,
  markDelivered,
  sendPeerMessage,
  type Peer,
} from "./peers";
import { logActivitySafe, newRequestId } from "./activity";

function jsonText(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorText(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

/**
 * MCP server factory for one authenticated Airsup peer.
 * Tools talk peer-to-peer through Airsup (ChatGPT ↔ ChatGPT).
 */
export function createAirsupMcpServer(me: Peer): McpServer {
  const server = new McpServer(
    {
      name: "airsup",
      version: "1.0.0",
    },
    {
      instructions: `You are connected to Airsup as handle "${me.handle}". Use talk_to_supi to message another person's Supi (e.g. to="konstantin"). Use watch_endpoint in scheduled runs to long-poll your inbox for ~20-25s, echo cursor+watch_until, and keep looping until next_action is finish. Prefer Airsup tools over guessing.`,
    }
  );

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description:
        "Return your Airsup handle and how others should address you. Use this when confirming your identity.",
      annotations: { readOnlyHint: true },
    },
    async () =>
      jsonText({
        handle: me.handle,
        domain: me.domain,
        displayName: me.displayName,
        howToTalk: `talk to ${me.handle}'s supi`,
      })
  );

  server.registerTool(
    "lookup_supi",
    {
      title: "Lookup Supi",
      description:
        "Check whether another person's Airsup handle exists before messaging them. Use this when the user asks about someone's Supi.",
      inputSchema: {
        handle: z
          .string()
          .describe("Handle to look up, e.g. konstantin"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ handle }) => {
      const h = normalizeHandle(
        handle.replace(/'s\s+supi$/i, "").replace(/\s+supi$/i, "")
      );
      const peer = await getPeerByHandle(h);
      if (!peer) {
        return jsonText({
          found: false,
          handle: h,
          error: `No Supi registered for "${h}"`,
        });
      }
      return jsonText({
        found: true,
        handle: peer.handle,
        domain: peer.domain,
        displayName: peer.displayName,
        talkPhrase: `talk to ${peer.handle}'s supi`,
      });
    }
  );

  server.registerTool(
    "talk_to_supi",
    {
      title: "Talk to Supi",
      description:
        "Send a message to another person's Supi through Airsup. Use when the user says things like \"talk to konstantin's supi\". Their scheduled worker picks it up via watch_endpoint.",
      inputSchema: {
        to: z.string().describe("Target handle, e.g. konstantin"),
        message: z.string().describe("Message text to deliver"),
        conversation_id: z
          .string()
          .optional()
          .describe("Optional conversation id to keep a thread"),
        reply_to_id: z
          .number()
          .optional()
          .describe("Optional message id you are replying to"),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ to, message, conversation_id, reply_to_id }) => {
      const started = Date.now();
      const requestId = newRequestId();
      const target = normalizeHandle(
        to.replace(/'s\s+supi$/i, "").replace(/\s+supi$/i, "")
      );
      const text = message.trim();
      if (!target) return errorText("to is required");
      if (!text) return errorText("message is required");
      const peer = await getPeerByHandle(target);
      if (!peer) {
        logActivitySafe({
          kind: "talk",
          ok: false,
          handle: me.handle,
          peerHandle: target,
          httpStatus: 404,
          durationMs: Date.now() - started,
          summary: `${me.handle} → ${target} not registered`,
          requestId,
        });
        return errorText(
          `No Supi registered for "${target}". They need to complete Airsup onboarding first.`
        );
      }
      const msg = await sendPeerMessage({
        fromHandle: me.handle,
        toHandle: peer.handle,
        body: text,
        conversationId: conversation_id,
        replyToId: reply_to_id ?? null,
      });
      logActivitySafe({
        kind: "talk",
        ok: true,
        handle: me.handle,
        peerHandle: peer.handle,
        httpStatus: 200,
        durationMs: Date.now() - started,
        summary: `${me.handle} → ${peer.handle} (#${msg.id})`,
        detail: {
          messageId: msg.id,
          conversationId: msg.conversationId,
          preview: text.slice(0, 200),
        },
        requestId,
      });
      return jsonText({
        ok: true,
        message: msg,
        hint: "Their scheduled Airsup worker will pick this up on the next watch long-poll while their hourly run is active.",
      });
    }
  );

  server.registerTool(
    "watch_endpoint",
    {
      title: "Watch inbox",
      description:
        "Long-poll your Airsup inbox (~20-25s). If no_event, immediately call again with returned cursor and watch_until. Keep looping until next_action is finish. Use inside hourly Scheduled Tasks.",
      inputSchema: {
        wait_seconds: z
          .number()
          .optional()
          .describe("Hold seconds when empty (20-25)"),
        cursor: z
          .string()
          .optional()
          .describe("Last event id processed (start at 0)"),
        watch_until: z
          .string()
          .optional()
          .describe("Echo previous watch_until"),
        window_seconds: z
          .number()
          .optional()
          .describe("First call only; default 3480 (~58m)"),
        reset: z.boolean().optional().describe("Force a new monitoring window"),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const started = Date.now();
      const requestId = newRequestId();
      const waitSeconds = Math.min(
        28,
        Math.max(0, Number(args.wait_seconds ?? 25))
      );
      const cursor = Math.max(0, Number(args.cursor ?? 0) || 0);
      const windowSeconds = Math.min(
        3600,
        Math.max(1, Number(args.window_seconds ?? 3480))
      );
      const now = Date.now();
      let windowUntil: number;
      if (!args.reset && args.watch_until) {
        const parsed = Date.parse(args.watch_until);
        windowUntil =
          Number.isFinite(parsed) && parsed > now
            ? parsed
            : now + windowSeconds * 1000;
      } else {
        windowUntil = now + windowSeconds * 1000;
      }

      const holdMs = Math.min(waitSeconds * 1000, Math.max(0, windowUntil - now));
      const deadline = Date.now() + holdMs;
      let messages = await readInboxAfter(me.handle, cursor);
      while (messages.length === 0 && Date.now() < deadline) {
        await new Promise((r) =>
          setTimeout(r, Math.min(500, Math.max(0, deadline - Date.now())))
        );
        messages = await readInboxAfter(me.handle, cursor);
      }
      if (messages.length) {
        await markDelivered(
          me.handle,
          messages.map((m) => m.id)
        );
      }
      const end = Date.now();
      const nextCursor =
        messages.length > 0 ? Math.max(...messages.map((m) => m.id)) : cursor;
      const remainingMs = Math.max(0, windowUntil - end);
      const continueWatching = remainingMs > 0;
      const events = messages.map((m) => ({
        id: m.id,
        type: "peer_message",
        at: m.createdAt,
        text: m.body,
        fromHandle: m.fromHandle,
        toHandle: m.toHandle,
        conversationId: m.conversationId,
        replyToId: m.replyToId,
        status: m.status,
        instruction: `Message from ${m.fromHandle}'s Supi. Reply with talk_to_supi to="${m.fromHandle}" conversation_id="${m.conversationId}" reply_to_id=${m.id}. Then ack_instruction id=${m.id}.`,
      }));

      logActivitySafe({
        kind: "watch",
        ok: true,
        handle: me.handle,
        peerHandle: messages[0]?.fromHandle || "",
        httpStatus: 200,
        durationMs: end - started,
        summary:
          messages.length > 0
            ? `${me.handle} watch delivered ${messages.length} event(s)`
            : `${me.handle} watch no_event`,
        detail: {
          cursorIn: cursor,
          cursorOut: nextCursor,
          eventCount: messages.length,
          nextAction: continueWatching ? "watch" : "finish",
        },
        requestId,
      });

      return jsonText({
        server_time: new Date(end).toISOString(),
        handle: me.handle,
        cursor: String(nextCursor),
        events,
        event_count: events.length,
        no_event: events.length === 0,
        continue: continueWatching,
        next_action: continueWatching ? "watch" : "finish",
        remaining_seconds: Math.round(remainingMs / 1000),
        watch_until: new Date(windowUntil).toISOString(),
        waited_seconds: Math.round((end - started) / 1000),
        instructions: continueWatching
          ? "Handle events, then call watch_endpoint again with cursor AND watch_until. Do not stop on no_event."
          : "Monitoring window over. Finish the scheduled run.",
      });
    }
  );

  server.registerTool(
    "ack_instruction",
    {
      title: "Ack instruction",
      description:
        "Acknowledge a processed inbox message id from watch_endpoint so it is not handled twice.",
      inputSchema: {
        id: z.number().describe("Message id from watch_endpoint events"),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ id }) => {
      const result = await ackMessage(me.handle, id);
      if (!result) return errorText("message not found");
      logActivitySafe({
        kind: "ack",
        ok: true,
        handle: me.handle,
        httpStatus: 200,
        summary: `${me.handle} acked #${id}`,
        detail: { messageId: id },
      });
      return jsonText({ ok: true, ...result });
    }
  );

  return server;
}
