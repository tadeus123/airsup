import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ackMessage,
  getPeerByHandle,
  normalizeHandle,
  sendPeerMessage,
  type Peer,
} from "./peers";
import { logActivitySafe, newRequestId } from "./activity";
import { runPeerWatch } from "./peer-watch";

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
 * MCP server for one authenticated Airsup peer.
 * ChatGPT Plus needs readOnlyHint:true. Prefer watch_batch to cut connector calls.
 */
export function createAirsupMcpServer(me: Peer): McpServer {
  const server = new McpServer(
    {
      name: "airsup",
      version: "1.2.0",
    },
    {
      instructions: `You are connected to Airsup as handle "${me.handle}".

CONVERSATIONS (normal chat — critical)
When the user asks you to talk to someone's Supi (e.g. "talk to tade's supi"):
1. Call talk_to_supi with their request.
2. Do NOT stop after sending. Immediately call await_supi_reply with the returned conversation_id and from=peer handle.
3. When a reply arrives: show it to the user, continue the negotiation with talk_to_supi (same conversation_id), then await_supi_reply again.
4. Keep this send→wait→reply loop going until the user's goal is actually finished (agreement reached, booking confirmed, question fully answered, or user explicitly says stop).
5. Only then ack inbox events and summarize. Never end after a single outbound message.

SCANNER RUNS
Prefer watch_batch. On inbox events use reply_and_ack after a successful reply. Unacked events replay until ack.`,
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
        "Return your Airsup handle and how others should address you.",
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
        "Check whether another person's Airsup handle exists before messaging them.",
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
        "Send a message to another person's Supi. After a successful send in a user conversation, you MUST call await_supi_reply next and keep the dialogue going until the user's goal is fully done — do not stop after one message.",
      inputSchema: {
        to: z.string().describe("Target handle, e.g. tade or kosti"),
        message: z.string().describe("Message text to deliver"),
        conversation_id: z
          .string()
          .optional()
          .describe("Reuse for the same thread"),
        reply_to_id: z.number().optional(),
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
        next_action: "await_supi_reply",
        conversation_id: msg.conversationId,
        peer_handle: peer.handle,
        instructions: `Message delivered to ${peer.handle}. Do NOT finish. Immediately call await_supi_reply(from="${peer.handle}", conversation_id="${msg.conversationId}"). When they reply, continue talking with talk_to_supi using the same conversation_id until the user's goal is fully agreed/done.`,
      });
    }
  );

  server.registerTool(
    "await_supi_reply",
    {
      title: "Await Supi reply",
      description:
        "After talk_to_supi, wait for that peer's reply in the same conversation. Keep calling this (and talk_to_supi) until the user's goal is finished. Do not stop after one outbound message.",
      inputSchema: {
        from: z
          .string()
          .describe("Peer handle you are waiting on, e.g. tade"),
        conversation_id: z
          .string()
          .describe("conversation_id from talk_to_supi"),
        wait_seconds: z
          .number()
          .optional()
          .describe("Internal poll slice seconds (default 20)"),
        polls: z.number().optional().describe("Internal slices (default 5)"),
        max_seconds: z
          .number()
          .optional()
          .describe("Max wait this call (default 100)"),
        cursor: z.string().optional(),
        watch_until: z.string().optional(),
      },
      annotations: chatgptPlusSafe,
      _meta: noauthMeta,
    },
    async (args) => {
      const from = normalizeHandle(
        args.from.replace(/'s\s+supi$/i, "").replace(/\s+supi$/i, "")
      );
      const result = await runPeerWatch(
        me,
        {
          waitSeconds: args.wait_seconds ?? 20,
          polls: args.polls ?? 5,
          maxSeconds: args.max_seconds ?? 100,
          cursor: args.cursor,
          watchUntil: args.watch_until,
          windowSeconds: 900,
          fromHandle: from,
          conversationId: args.conversation_id,
        },
        { batch: true, mode: "conversation" }
      );
      return jsonText({
        ...result,
        next_action: result.event_count
          ? "continue_conversation"
          : "await_supi_reply",
        peer_handle: from,
        conversation_id: args.conversation_id,
      });
    }
  );

  server.registerTool(
    "reply_and_ack",
    {
      title: "Reply and ack",
      description:
        "Watch-loop helper: send reply first; only ack if send succeeded. Never ack a failed reply. Keeps unacked events replayable by the server.",
      inputSchema: {
        to: z.string().describe("event.fromHandle"),
        message: z.string().describe("Reply text"),
        conversation_id: z.string().describe("event.conversationId"),
        reply_to_id: z.number().describe("event.id"),
        ack_id: z.number().optional().describe("Defaults to reply_to_id"),
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

      let msg;
      try {
        msg = await sendPeerMessage({
          fromHandle: me.handle,
          toHandle: peer.handle,
          body: text,
          conversationId: conversation_id,
          replyToId: reply_to_id,
        });
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        logActivitySafe({
          kind: "talk",
          ok: false,
          handle: me.handle,
          peerHandle: peer.handle,
          httpStatus: 500,
          durationMs: Date.now() - started,
          summary: `${me.handle} reply FAILED (not acked #${ackTarget}): ${err}`,
          detail: { ackId: ackTarget, error: err },
          requestId,
        });
        return errorText(
          `Reply failed; event #${ackTarget} left UNACKED for replay. Error: ${err}`
        );
      }

      const acked = await ackMessage(me.handle, ackTarget);
      if (!acked) {
        return jsonText({
          ok: false,
          replied: true,
          message: msg,
          ack: null,
          error: `Reply sent but ack #${ackTarget} failed; treat as unacked and retry ack only.`,
        });
      }

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
          preview: text.slice(0, 200),
        },
        requestId,
      });
      return jsonText({
        ok: true,
        message: msg,
        ack: acked,
        hint: "Resume watch_batch immediately with cursor + watch_until.",
      });
    }
  );

  server.registerTool(
    "watch_endpoint",
    {
      title: "Watch inbox",
      description:
        "Single long-poll (~20-24s). Prefer watch_batch in scheduled workers to reduce ChatGPT MCP call volume. Unacked events are always replayed until ack.",
      inputSchema: {
        wait_seconds: z.number().optional().describe("Hold seconds (20-24)"),
        cursor: z.string().optional().describe("Client progress hint"),
        watch_until: z.string().optional().describe("Echo previous watch_until"),
        window_seconds: z
          .number()
          .optional()
          .describe("First call only; prefer 780"),
        reset: z.boolean().optional(),
      },
      annotations: chatgptPlusSafe,
      _meta: noauthMeta,
    },
    async (args) =>
      jsonText(
        await runPeerWatch(me, {
          waitSeconds: args.wait_seconds,
          cursor: args.cursor,
          watchUntil: args.watch_until,
          windowSeconds: args.window_seconds,
          reset: args.reset,
        })
      )
  );

  server.registerTool(
    "watch_batch",
    {
      title: "Watch batch",
      description:
        "Preferred scheduled-worker watch. Airsup runs multiple internal polls in ONE MCP call (default polls=5, wait_seconds=20, max_seconds=100) and returns immediately if an unacked event appears. Cuts ChatGPT↔MCP round trips ~5× vs watch_endpoint.",
      inputSchema: {
        cursor: z.string().optional().describe("Client progress hint"),
        watch_until: z.string().optional().describe("Echo previous watch_until"),
        wait_seconds: z
          .number()
          .optional()
          .describe("Seconds per internal poll slice (default 20)"),
        polls: z
          .number()
          .optional()
          .describe("Max internal poll slices (default 5)"),
        max_seconds: z
          .number()
          .optional()
          .describe("Hard cap for this MCP call (default 100)"),
        window_seconds: z
          .number()
          .optional()
          .describe("First call only monitoring window; prefer 780"),
        reset: z.boolean().optional(),
      },
      annotations: chatgptPlusSafe,
      _meta: noauthMeta,
    },
    async (args) =>
      jsonText(
        await runPeerWatch(
          me,
          {
            waitSeconds: args.wait_seconds ?? 20,
            cursor: args.cursor,
            watchUntil: args.watch_until,
            windowSeconds: args.window_seconds,
            reset: args.reset,
            polls: args.polls ?? 5,
            maxSeconds: args.max_seconds ?? 100,
          },
          { batch: true }
        )
      )
  );

  server.registerTool(
    "ack_instruction",
    {
      title: "Ack instruction",
      description:
        "Ack an inbox id only after the required reply succeeded. Prefer reply_and_ack.",
      inputSchema: {
        id: z.number().describe("Message id from watch events"),
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
