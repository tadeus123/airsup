import type { Connection } from "./connection";

/**
 * True for a real browser navigating to this URL (address bar / link click).
 * False for reverse-proxies, Next rewrites, and most server-side fetches
 * (they typically omit Sec-Fetch-* headers).
 *
 * Used so the Airsup Vercel connector never presents Supi as living here,
 * while customer-domain proxies keep working.
 */
export function isDirectBrowserNavigation(request: Request): boolean {
  const mode = (request.headers.get("sec-fetch-mode") || "").toLowerCase();
  const dest = (request.headers.get("sec-fetch-dest") || "").toLowerCase();
  if (mode === "navigate") return true;
  if (dest === "document" || dest === "iframe") return true;
  return false;
}

export function customerSiteUrl(connection: Connection, path = "/"): string | null {
  if (!connection.websiteDomain) return null;
  const base = `https://${connection.websiteDomain.replace(/\/$/, "")}`;
  if (!path || path === "/") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
