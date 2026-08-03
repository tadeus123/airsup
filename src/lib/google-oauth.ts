import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  clearGoogleTokens,
  getGoogleTokens,
  saveGoogleTokens,
  type GoogleTokenSet,
} from "./connection";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.modify",
].join(" ");

function oauthConfig() {
  const clientId = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
  const redirectUri = (
    process.env.GOOGLE_OAUTH_REDIRECT_URI ??
    process.env.GOOGLE_REDIRECT_URI ??
    ""
  ).trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to connect Google Calendar."
    );
  }
  return { clientId, clientSecret, redirectUri };
}

function stateSecret(): string {
  return (
    process.env.GOOGLE_OAUTH_STATE_SECRET ||
    process.env.AIRSUP_DB_TOKEN ||
    process.env.SETUP_PASSWORD ||
    process.env.AGENT_SECRET ||
    "airsup-dev-oauth-state"
  );
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    (process.env.GOOGLE_CLIENT_ID ?? "").trim() &&
      (process.env.GOOGLE_CLIENT_SECRET ?? "").trim()
  );
}

export function buildRedirectUri(requestOrigin: string): string {
  const configured = oauthConfig().redirectUri;
  if (configured) return configured;
  return `${requestOrigin.replace(/\/$/, "")}/api/google/callback`;
}

export function createOAuthState(websiteDomain: string): string {
  const nonce = randomBytes(16).toString("hex");
  const domain = websiteDomain.trim().toLowerCase();
  const payload = `${Date.now()}.${nonce}.${domain}`;
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyOAuthState(state: string, expectedDomain?: string): {
  websiteDomain: string;
} {
  let decoded: string;
  try {
    decoded = Buffer.from(state, "base64url").toString("utf8");
  } catch {
    throw new Error("Invalid OAuth state");
  }
  const parts = decoded.split(".");
  if (parts.length !== 4) throw new Error("Invalid OAuth state");
  const [ts, nonce, domain, sig] = parts;
  if (!ts || !nonce || !domain || !sig) throw new Error("Invalid OAuth state");
  const payload = `${ts}.${nonce}.${domain}`;
  const expected = createHmac("sha256", stateSecret()).update(payload).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid OAuth state signature");
  }
  const ageMs = Date.now() - Number(ts);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 15 * 60 * 1000) {
    throw new Error("OAuth state expired");
  }
  if (expectedDomain && domain !== expectedDomain.trim().toLowerCase()) {
    throw new Error("OAuth state domain mismatch");
  }
  return { websiteDomain: domain };
}

export function googleAuthUrl(opts: {
  requestOrigin: string;
  websiteDomain: string;
}): string {
  const { clientId } = oauthConfig();
  const redirectUri = buildRedirectUri(opts.requestOrigin);
  const state = createOAuthState(opts.websiteDomain);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

export async function exchangeCodeForTokens(opts: {
  code: string;
  requestOrigin: string;
}): Promise<GoogleTokenSet> {
  const { clientId, clientSecret } = oauthConfig();
  const redirectUri = buildRedirectUri(opts.requestOrigin);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const json = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Google token exchange failed");
  }

  const email = await fetchGoogleEmail(json.access_token, json.id_token);
  const expiry = new Date(Date.now() + (json.expires_in || 3600) * 1000).toISOString();
  const tokens: GoogleTokenSet = {
    refreshToken: json.refresh_token || "",
    accessToken: json.access_token,
    tokenExpiry: expiry,
    email,
    scopes: json.scope || GOOGLE_SCOPES,
    connected: true,
  };
  await saveGoogleTokens(tokens);
  return tokens;
}

async function fetchGoogleEmail(accessToken: string, idToken?: string): Promise<string> {
  if (idToken) {
    try {
      const payload = JSON.parse(
        Buffer.from(idToken.split(".")[1] || "", "base64url").toString("utf8")
      ) as { email?: string };
      if (payload.email) return payload.email;
    } catch {
      // fall through
    }
  }
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const json = (await response.json().catch(() => ({}))) as { email?: string };
  return json.email || "";
}

export async function getValidAccessToken(): Promise<{
  accessToken: string;
  email: string;
  scopes: string;
} | null> {
  const stored = await getGoogleTokens();
  if (!stored?.connected || (!stored.refreshToken && !stored.accessToken)) {
    return null;
  }

  const expiryMs = stored.tokenExpiry ? new Date(stored.tokenExpiry).getTime() : 0;
  const stillValid =
    stored.accessToken && expiryMs && expiryMs - Date.now() > 60_000;

  if (stillValid) {
    return {
      accessToken: stored.accessToken,
      email: stored.email,
      scopes: stored.scopes,
    };
  }

  if (!stored.refreshToken) return null;

  const { clientId, clientSecret } = oauthConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: stored.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !json.access_token) {
    return null;
  }

  const next: GoogleTokenSet = {
    ...stored,
    accessToken: json.access_token,
    tokenExpiry: new Date(Date.now() + (json.expires_in || 3600) * 1000).toISOString(),
    scopes: json.scope || stored.scopes,
    connected: true,
  };
  await saveGoogleTokens(next);
  return {
    accessToken: next.accessToken,
    email: next.email,
    scopes: next.scopes,
  };
}

export async function disconnectGoogle(): Promise<void> {
  await clearGoogleTokens();
}
