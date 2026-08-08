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
 *
 * ChatGPT Plus/Pro only executes MCP tools with readOnlyHint:true.
 * ChatGPT may also detach an MCP app mid-conversation after many tool calls
 * ("tool has been disabled") — prefer ~13-15 minute watch windows, not 58m.
 */
export function createAirsupMcpServer(me: Peer): McpServer {
  const server = new McpServer(
    {
      name: "airsup",
      version: "1.0.3",
    },
    {
      instructions: `You are connected to Airsup as handle "${me.handle}". For outbound chat use talk_to_supi. Inside a watch loop, after an inbox event use reply_and_ack (one call) then resume watch_endpoint. Prefer ~13-15 minute watch windows because ChatGPT may detach MCP mid-run after too many tool calls.`,
    }
  );

  const chatgptPlusSafe = {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  } as const;

  const noauthMeta = {
    securitySchemes: [{ type: "noauth" as const }],
  };

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description:
        "Return your Airsup handle and how others should address you. Use this when confirming your identity.",
      annotations: chatgptPlusSafe,
      _meta: noauthMeta,
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
        handle: z.string().describe("Handle to look up, e.g. tade or kosti"),
      },
      annotations: chatgptPlusSafe,
      _meta: noauthMeta,
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
        "Use this when the user says talk to someone's supi from a normal chat. For replies inside a watch loop, prefer reply_and_ack instead.",
      inputSchema: {
        to: z.string().describe("Target handle, e.g. tade or kosti"),
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
      annotations: chatgptPlusSafe,
      _meta: noauthMeta,
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
        hint: "Their Airsup worker picks this up on the next watch_endpoint long-poll while its scanning window is active.",
      });
    }
  );

  server.registerTool(
    "reply_and_ack",
    {
      title: "Reply and ack",
      description:
        "Use this inside a watch loop after an inbox event. Sends one reply AND acknowledges the inbox id in a single tool call so ChatGPT cannot lose the Airsup plugin between talk and ack.",
      inputSchema: {
        to: z.string().describe("event.fromHandle"),
        message: z.string().describe("Reply text"),
        conversation_id: z.string().describe("event.conversationId"),
        reply_to_id: z.number().describe("event.id (also acked)"),
        ack_id: z
          .number()
          .optional()
          .describe("Defaults to reply_to_id"),
      },
      annotations: chatgptPlusSafe,
      _meta: noauthMeta,
    },
    async ({ to, message, conversation_id, reply_to_id, ack_id }) => {
      const started = Date.now();
      const requestId = newRequestId();
      const target = normalizeHandle(
        to.replace(/'s\s+supi$/i, "").replace(/\s+supi$/i, "")
      );
      const text = message.trim();
      const ackTarget = Number(ack_id ?? reply_to_id);
      if (!target) return errorText("to is required");
      if (!text) return errorText("message is required");
      if (!Number.isFinite(ackTarget) || ackTarget <= 0) {
        return errorText("reply_to_id / ack_id required");
      }
      const peer = await getPeerByHandle(target);
      if (!peer) return errorText(`No Supi registered for "${target}"`);
      const msg = await sendPeerMessage({
        fromHandle: me.handle,
        toHandle: peer.handle,
        body: text,
        conversationId: conversation_id,
        replyToId: reply_to_id,
      });
      const acked = await ackMessage(me.handle, ackTarget);
      logActivitySafe({
        kind: "talk",
        ok: true,
        handle: me.handle,
        peerHandle: peer.handle,
        httpStatus: 200,
        durationMs: Date.now() - started,
        summary: `${me.handle} reply_and_ack → ${peer.handle} (#${msg.id}) ack #${ackTarget}`,
        detail: {
          messageId: msg.id,
          conversationId: msg.conversationId,
          ackId: ackTarget,
          acked: Boolean(acked),
          preview: text.slice(0, 200),
        },
        requestId,
      });
      return jsonText({
        ok: true,
        message: msg,
        ack: acked || { id: ackTarget, status: "acked" },
        hint: "Resume watch_endpoint immediately with the latest cursor and watch_until.",
      });
    }
  );

  server.registerTool(
    "watch_endpoint",
    {
      title: "Watch inbox",
      description:
        "Long-poll your Airsup inbox (~20-24s). If no_event, immediately call again with returned cursor and watch_until. Keep looping until next_action is finish. Prefer ~13-15 minute windows because ChatGPT may detach MCP mid-run after too many tool calls.",
      inputSchema: {
        wait_seconds: z
          .number()
          .optional()
          .describe("Hold seconds when empty (20-24)"),
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
          .describe("First call only; prefer 780 (~13m)"),
        reset: z.boolean().optional().describe("Force a new monitoring window"),
      },
      annotations: chatgptPlusSafe,
      _meta: noauthMeta,
    },
    async (args) => {
      const started = Date.now();
      const requestId = newRequestId();
      const waitSeconds = Math.min(
        28,
        Math.max(0, Number(args.wait_seconds ?? 24))
      );
      const cursor = Math.max(0, Number(args.cursor ?? 0) || 0);
      const windowSeconds = Math.min(
        3600,
        Math.max(1, Number(args.window_seconds ?? 780))
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
        instruction: `Message from ${m.fromHandle}'s Supi. First print a short visible Inbox line. Then call reply_and_ack to="${m.fromHandle}" conversation_id="${m.conversationId}" reply_to_id=${m.id}. Then resume watch_endpoint.`,
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
          ? "Handle events with reply_and_ack, then call watch_endpoint again with cursor AND watch_until. Do not stop on no_event."
          : "Monitoring window over. Finish this run; the next scheduled run will start a fresh MCP attachment.",
      });
    }
  );

  server.registerTool(
    "ack_instruction",
    {
      title: "Ack instruction",
      description:
        "Acknowledge a processed inbox message id. Prefer reply_and_ack during watch loops.",
      inputSchema: {
        id: z.number().describe("Message id from watch_endpoint events"),
      },
      annotations: chatgptPlusSafe,
      _meta: noauthMeta,
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
