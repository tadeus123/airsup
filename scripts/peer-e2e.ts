/**
 * Deterministic peer messaging proof (no ChatGPT UI required).
 * Simulates: tade talks to kostis → kostis watch picks up → kostis replies → tade receives.
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
  markDelivered,
} from "../src/lib/peers";

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

  const inbox = await readInboxAfter("kostise2e", 0);
  const hit = inbox.find((m) => m.id === outbound.id);
  assert(hit, "kostis inbox has message");
  assert(hit.body.includes("Thursday"), "body");
  await markDelivered("kostise2e", [hit.id]);
  await ackMessage("kostise2e", hit.id);

  const reply = await sendPeerMessage({
    fromHandle: "kostise2e",
    toHandle: "tadee2e",
    body: "Yes — Thursday 3pm works.",
    conversationId: outbound.conversationId,
    replyToId: outbound.id,
  });
  const tadeInbox = await readInboxAfter("tadee2e", 0);
  const replyHit = tadeInbox.find((m) => m.id === reply.id);
  assert(replyHit, "tade got reply");
  assert(replyHit.body.includes("Thursday 3pm"), "reply body");

  console.log("OK peer e2e passed", {
    conversationId: outbound.conversationId,
    outboundId: outbound.id,
    replyId: reply.id,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
