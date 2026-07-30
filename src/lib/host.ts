import type { Connection } from "./connection";

function requestHost(request: Request): string {
  return (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    new URL(request.url).host
  )
    .split(",")[0]
    ?.trim()
    .toLowerCase()
    .replace(/:\d+$/, "") || "";
}

/**
 * True for a real browser navigating to this URL (address bar / link click).
 * False for reverse-proxies, Next rewrites, and most server-side fetches.
 */
export function isDirectBrowserNavigation(request: Request): boolean {
  const mode = (request.headers.get("sec-fetch-mode") || "").toLowerCase();
  const dest = (request.headers.get("sec-fetch-dest") || "").toLowerCase();
  if (mode === "navigate") return true;
  if (dest === "document" || dest === "iframe") return true;
  return false;
}

/** Request is clearly on the connected customer website (apex or www). */
export function isCustomerWebsiteHost(
  request: Request,
  connection: Connection
): boolean {
  const domain = connection.websiteDomain?.trim().toLowerCase();
  if (!domain) return false;
  const host = requestHost(request);
  return host === domain || host === `www.${domain}`;
}

/**
 * Airsup setup host only (e.g. *.vercel.app), not the customer domain.
 * Supi must work on the customer website even when that domain points at this app.
 */
export function isAirsupSetupHost(
  request: Request,
  connection: Connection
): boolean {
  if (isCustomerWebsiteHost(request, connection)) return false;
  const host = requestHost(request);
  if (!host) return true;
  if (host.endsWith(".vercel.app")) return true;
  if (host === "airsup.vercel.app") return true;
  // Unknown hosts: treat as setup host so Supi is not advertised there.
  return true;
}

/** Block Supi UI/discovery only for direct browser hits on the setup host. */
export function shouldHideSupiOnSetupHost(
  request: Request,
  connection: Connection
): boolean {
  return isDirectBrowserNavigation(request) && isAirsupSetupHost(request, connection);
}

export function customerSiteUrl(
  connection: Connection,
  path = "/",
  request?: Request
): string | null {
  if (!connection.websiteDomain) return null;
  let host = connection.websiteDomain.replace(/\/$/, "").toLowerCase();
  if (request) {
    const reqHost = requestHost(request);
    if (reqHost === `www.${host}`) host = reqHost;
  }
  const base = `https://${host}`;
  if (!path || path === "/") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
