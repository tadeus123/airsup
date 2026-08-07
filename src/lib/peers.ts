import { createHash, randomBytes } from "node:crypto";

export type Peer = {
  handle: string;
  domain: string;
  displayName: string;
  tokenPrefix: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PeerMessage = {
  id: number;
  conversationId: string;
  fromHandle: string;
  toHandle: string;
  body: string;
  status: "pending" | "delivered" | "acked";
  replyToId: number | null;
  createdAt: string;
};

type MemoryPeer = Peer & { tokenHash: string };
type MemoryStore = {
  peers: Map<string, MemoryPeer>;
  byHash: Map<string, string>;
  messages: PeerMessage[];
  seq: number;
};

const memory: MemoryStore = {
  peers: new Map(),
  byHash: new Map(),
  messages: [],
  seq: 0,
};

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
  const token = process.env.AIRSUP_DB_TOKEN ?? "";
  if (!url || !anonKey || !token) return null;
  return { url, anonKey, token };
}

async function supabaseRpc<T>(
  fn: string,
  body: Record<string, unknown>
): Promise<T | null> {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  const response = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: cfg.anonKey,
      authorization: `Bearer ${cfg.anonKey}`,
    },
    body: JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (json &&
        typeof json === "object" &&
        "message" in json &&
        String((json as { message: string }).message)) ||
      `Supabase RPC ${fn} failed (${response.status})`;
    throw new Error(message);
  }
  return json as T;
}

export function normalizeHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Derive a human handle from a website domain (kostis.com → kostis). */
export function handleFromDomain(domain: string): string {
  const host = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/^www\./, "")
    .split(":")[0];
  const label = host.split(".")[0] || host;
  return normalizeHandle(label);
}

export function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/^www\./, "");
}

export function hashPeerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function mintPeerToken(): { token: string; hash: string; prefix: string } {
  const token = `asp_${randomBytes(24).toString("hex")}`;
  return {
    token,
    hash: hashPeerToken(token),
    prefix: token.slice(0, 10),
  };
}

function extractBearer(request: Request): string {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match?.[1]) return match[1].trim();
  const url = new URL(request.url);
  return (
    request.headers.get("x-airsup-token") ||
    url.searchParams.get("token") ||
    ""
  ).trim();
}

export async function registerPeer(input: {
  domain?: string;
  handle?: string;
  displayName?: string;
}): Promise<{ peer: Peer; token: string }> {
  const domain = normalizeDomain(input.domain || "");
  const handle = normalizeHandle(
    input.handle || (domain ? handleFromDomain(domain) : "")
  );
  if (!handle) throw new Error("Handle is required");
  if (handle.length < 2) throw new Error("Handle must be at least 2 characters");
  const displayName = (input.displayName || handle).trim();
  const minted = mintPeerToken();

  const cfg = supabaseConfig();
  if (cfg) {
    const row = await supabaseRpc<Peer>("airsup_peer_upsert", {
      p_token: cfg.token,
      p_handle: handle,
      p_domain: domain,
      p_display_name: displayName,
      p_token_hash: minted.hash,
      p_token_prefix: minted.prefix,
    });
    if (!row?.handle) throw new Error("Failed to register peer");
    return { peer: row, token: minted.token };
  }

  const peer: MemoryPeer = {
    handle,
    domain,
    displayName,
    tokenPrefix: minted.prefix,
    tokenHash: minted.hash,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  const previous = memory.peers.get(handle);
  if (previous) memory.byHash.delete(previous.tokenHash);
  memory.peers.set(handle, peer);
  memory.byHash.set(minted.hash, handle);
  return {
    peer: {
      handle: peer.handle,
      domain: peer.domain,
      displayName: peer.displayName,
      tokenPrefix: peer.tokenPrefix,
      createdAt: peer.createdAt,
      updatedAt: peer.updatedAt,
    },
    token: minted.token,
  };
}

export async function getPeerByHandle(handle: string): Promise<Peer | null> {
  const h = normalizeHandle(handle);
  if (!h) return null;
  const cfg = supabaseConfig();
  if (cfg) {
    return await supabaseRpc<Peer | null>("airsup_peer_get_by_handle", {
      p_token: cfg.token,
      p_handle: h,
    });
  }
  const peer = memory.peers.get(h);
  if (!peer) return null;
  return {
    handle: peer.handle,
    domain: peer.domain,
    displayName: peer.displayName,
    tokenPrefix: peer.tokenPrefix,
    createdAt: peer.createdAt,
    updatedAt: peer.updatedAt,
  };
}

export async function authPeerFromRequest(request: Request): Promise<Peer> {
  const token = extractBearer(request);
  if (!token) throw new Error("Unauthorized");
  const hash = hashPeerToken(token);
  const cfg = supabaseConfig();
  if (cfg) {
    const peer = await supabaseRpc<Peer | null>("airsup_peer_auth", {
      p_token: cfg.token,
      p_token_hash: hash,
    });
    if (!peer?.handle) throw new Error("Unauthorized");
    return peer;
  }
  const handle = memory.byHash.get(hash);
  if (!handle) throw new Error("Unauthorized");
  const peer = memory.peers.get(handle);
  if (!peer) throw new Error("Unauthorized");
  return {
    handle: peer.handle,
    domain: peer.domain,
    displayName: peer.displayName,
    tokenPrefix: peer.tokenPrefix,
    createdAt: peer.createdAt,
    updatedAt: peer.updatedAt,
  };
}

export async function sendPeerMessage(input: {
  fromHandle: string;
  toHandle: string;
  body: string;
  conversationId?: string;
  replyToId?: number | null;
}): Promise<PeerMessage> {
  const fromHandle = normalizeHandle(input.fromHandle);
  const toHandle = normalizeHandle(input.toHandle);
  const body = input.body.trim();
  if (!body) throw new Error("Message body is required");
  if (fromHandle === toHandle) throw new Error("Cannot message yourself");

  const cfg = supabaseConfig();
  if (cfg) {
    const row = await supabaseRpc<PeerMessage>("airsup_peer_send", {
      p_token: cfg.token,
      p_from: fromHandle,
      p_to: toHandle,
      p_body: body,
      p_conversation_id: input.conversationId || "",
      p_reply_to_id: input.replyToId ?? null,
    });
    if (!row?.id) throw new Error("Send failed");
    return {
      id: Number(row.id),
      conversationId: row.conversationId,
      fromHandle: row.fromHandle,
      toHandle: row.toHandle,
      body: row.body,
      status: row.status,
      replyToId: row.replyToId ?? null,
      createdAt: row.createdAt,
    };
  }

  if (!memory.peers.has(fromHandle)) throw new Error("unknown from handle");
  if (!memory.peers.has(toHandle)) throw new Error("unknown to handle");
  memory.seq += 1;
  const msg: PeerMessage = {
    id: memory.seq,
    conversationId: input.conversationId || `mem_${memory.seq}`,
    fromHandle,
    toHandle,
    body,
    status: "pending",
    replyToId: input.replyToId ?? null,
    createdAt: new Date().toISOString(),
  };
  memory.messages.push(msg);
  return msg;
}

export async function readInboxAfter(
  handle: string,
  afterId: number
): Promise<PeerMessage[]> {
  const h = normalizeHandle(handle);
  const cfg = supabaseConfig();
  if (cfg) {
    const rows =
      (await supabaseRpc<PeerMessage[]>("airsup_peer_inbox_after", {
        p_token: cfg.token,
        p_handle: h,
        p_after_id: afterId,
      })) || [];
    return rows.map((row) => ({
      id: Number(row.id),
      conversationId: row.conversationId,
      fromHandle: row.fromHandle,
      toHandle: row.toHandle,
      body: row.body,
      status: row.status,
      replyToId: row.replyToId ?? null,
      createdAt: row.createdAt,
    }));
  }
  return memory.messages.filter((m) => m.toHandle === h && m.id > afterId);
}

export async function markDelivered(handle: string, ids: number[]): Promise<void> {
  if (!ids.length) return;
  const h = normalizeHandle(handle);
  const cfg = supabaseConfig();
  if (cfg) {
    await supabaseRpc("airsup_peer_mark_delivered", {
      p_token: cfg.token,
      p_handle: h,
      p_ids: ids,
    });
    return;
  }
  for (const msg of memory.messages) {
    if (msg.toHandle === h && ids.includes(msg.id) && msg.status === "pending") {
      msg.status = "delivered";
    }
  }
}

export async function ackMessage(
  handle: string,
  messageId: number
): Promise<{ id: number; status: string; ackedAt?: string } | null> {
  const h = normalizeHandle(handle);
  const cfg = supabaseConfig();
  if (cfg) {
    return await supabaseRpc("airsup_peer_ack", {
      p_token: cfg.token,
      p_handle: h,
      p_message_id: messageId,
    });
  }
  const msg = memory.messages.find((m) => m.id === messageId && m.toHandle === h);
  if (!msg) return null;
  msg.status = "acked";
  return { id: msg.id, status: "acked", ackedAt: new Date().toISOString() };
}

/** Test-only helper to clear in-memory peers between unit runs. */
export function __resetPeerMemoryForTests(): void {
  memory.peers.clear();
  memory.byHash.clear();
  memory.messages = [];
  memory.seq = 0;
}
