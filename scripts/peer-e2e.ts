/**
 * Deterministic peer messaging proof (no ChatGPT UI required).
 * Simulates: tade talks to kostis → kostis watch picks up → kostis replies → tade receives.
 * Also proves scanner watches skip reply-linked messages (interactive await owns them).
 *
 * Usage (from apps/airsup, with env loaded):
 *   pnpm exec tsx scripts/peer-e2e.ts
 */
import {
  __resetPeerMemoryForTests,
  ackMessage,
  authPeerFromRequest,
  getPeerByHandle,
  readInboxAfter,
  registerPeer,
  sendPeerMessage,
} from "../src/lib/peers";
import { filterMessages, runPeerWatch } from "../src/lib/peer-watch";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const usingSupabase = Boolean(
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_ANON_KEY &&
      process.env.AIRSUP_DB_TOKEN
  );
  console.log(`backend: ${usingSupabase ? "supabase" : "memory"}`);

  if (!usingSupabase) __resetPeerMemoryForTests();

  const tade = await registerPeer({
    domain: "tademehl-e2e.example",
    handle: "tadee2e",
    displayName: "Tade E2E",
  });
  const kostis = await registerPeer({
    domain: "kostis-e2e.example",
    handle: "kostise2e",
    displayName: "Kostis E2E",
  });

  assert(tade.peer.handle === "tadee2e", "tade handle");
  assert(kostis.peer.handle === "kostise2e", "kostis handle");
  assert((await getPeerByHandle("kostise2e"))?.handle === "kostise2e", "lookup");

  // Auth via forged request
  const tadeReq = new Request("https://airsup.test/api/plugin/whoami", {
    headers: { authorization: `Bearer ${tade.token}` },
  });
  const me = await authPeerFromRequest(tadeReq);
  assert(me.handle === "tadee2e", "auth tade");

  const outbound = await sendPeerMessage({
    fromHandle: "tadee2e",
    toHandle: "kostise2e",
    body: "Hey Kostis — free Thursday afternoon?",
  });
  assert(outbound.id > 0, "outbound id");
  console.log("sent", outbound.id, "→", outbound.toHandle);

  // New inbound (no replyToId) is visible to the scanner.
  const kostisScan = await runPeerWatch(
    kostis.peer,
    { waitSeconds: 0, polls: 1, maxSeconds: 1, windowSeconds: 60 },
    { batch: true, mode: "scanner" }
  );
  assert(
    kostisScan.events.some((e) => e.id === outbound.id),
    "scanner sees new inbound"
  );
  await ackMessage("kostise2e", outbound.id);

  const reply = await sendPeerMessage({
    fromHandle: "kostise2e",
    toHandle: "tadee2e",
    body: "Yes — Thursday 3pm works.",
    conversationId: outbound.conversationId,
    replyToId: outbound.id,
  });
  const tadeInbox = await readInboxAfter("tadee2e", 0);
  const replyHit = tadeInbox.find((m) => m.id === reply.id);
  assert(replyHit, "tade got reply in raw inbox");
  assert(replyHit.body.includes("Thursday 3pm"), "reply body");

  // Unit: scanner filter drops reply-linked; conversation filter keeps them.
  const scanned = filterMessages(tadeInbox, {}, { scanner: true });
  assert(
    !scanned.some((m) => m.id === reply.id),
    "scanner filter skips replyToId messages"
  );
  const awaited = filterMessages(
    tadeInbox,
    {
      fromHandle: "kostise2e",
      conversationId: outbound.conversationId,
    },
    { scanner: false }
  );
  assert(
    awaited.some((m) => m.id === reply.id),
    "conversation filter keeps reply"
  );

  // Integration: tade hourly scanner must not deliver the reply.
  const tadeScan = await runPeerWatch(
    tade.peer,
    { waitSeconds: 0, polls: 1, maxSeconds: 1, windowSeconds: 60 },
    { batch: true, mode: "scanner" }
  );
  assert(
    !tadeScan.events.some((e) => e.id === reply.id),
    "scanner watch skips reply-linked event"
  );

  // Interactive await (conversation mode) must still receive it.
  const tadeAwait = await runPeerWatch(
    tade.peer,
    {
      waitSeconds: 0,
      polls: 1,
      maxSeconds: 1,
      windowSeconds: 60,
      fromHandle: "kostise2e",
      conversationId: outbound.conversationId,
    },
    { batch: true, mode: "conversation" }
  );
  assert(
    tadeAwait.events.some((e) => e.id === reply.id),
    "await/conversation watch receives reply"
  );
  await ackMessage("tadee2e", reply.id);

  // Fresh inbound without replyToId still reaches scanner (unrelated new talk).
  const fresh = await sendPeerMessage({
    fromHandle: "kostise2e",
    toHandle: "tadee2e",
    body: "Unrelated new ping",
  });
  const tadeScanFresh = await runPeerWatch(
    tade.peer,
    { waitSeconds: 0, polls: 1, maxSeconds: 1, windowSeconds: 60 },
    { batch: true, mode: "scanner" }
  );
  assert(
    tadeScanFresh.events.some((e) => e.id === fresh.id),
    "scanner still sees new non-reply inbound"
  );
  await ackMessage("tadee2e", fresh.id);

  console.log("OK peer e2e passed", {
    conversationId: outbound.conversationId,
    outboundId: outbound.id,
    replyId: reply.id,
    freshId: fresh.id,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
