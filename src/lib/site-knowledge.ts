import { createHash } from "node:crypto";

export type KnowledgeMeta = {
  websiteDomain: string;
  pageCount: number;
  totalChars: number;
  crawlStatus: string;
  lastCrawlStartedAt: string | null;
  lastCrawlFinishedAt: string | null;
  lastChangeAt: string | null;
  sitemapFingerprint: string;
  lastError: string;
  updatedAt: string | null;
};

export type SitePage = {
  url: string;
  path: string;
  title: string;
  description: string;
  content: string;
  contentHash: string;
  etag: string;
  lastModified: string;
  statusCode: number;
  fetchedAt?: string;
};

export type CrawlResult = {
  meta: KnowledgeMeta;
  pages: SitePage[];
};

const MAX_PAGES = Number(process.env.SITE_KNOWLEDGE_MAX_PAGES || 120);
const MAX_PAGE_CHARS = Number(process.env.SITE_KNOWLEDGE_MAX_PAGE_CHARS || 40_000);
const MAX_TOTAL_CHARS = Number(process.env.SITE_KNOWLEDGE_MAX_TOTAL_CHARS || 280_000);
const MAX_PROMPT_CHARS = Number(process.env.SITE_KNOWLEDGE_MAX_PROMPT_CHARS || 220_000);
const STALE_MS = Number(process.env.SITE_KNOWLEDGE_STALE_MS || 2 * 60 * 1000);
const FETCH_TIMEOUT_MS = Number(process.env.SITE_KNOWLEDGE_FETCH_TIMEOUT_MS || 12_000);
const CRAWL_BUDGET_MS = Number(process.env.SITE_KNOWLEDGE_CRAWL_BUDGET_MS || 50_000);

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
  const token = process.env.AIRSUP_DB_TOKEN ?? "";
  if (!url || !anonKey || !token) return null;
  return { url, anonKey, token };
}

async function supabaseRpc<T>(fn: string, body: Record<string, unknown>): Promise<T | null> {
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

function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/^www\./, "");
}

function allowedHosts(domain: string): Set<string> {
  const root = normalizeDomain(domain);
  return new Set([root, `www.${root}`]);
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    });
}

function stripHtml(html: string): { title: string; description: string; text: string; links: string[] } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeHtmlEntities((titleMatch?.[1] || "").replace(/\s+/g, " ").trim());

  const descMatch =
    html.match(
      /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["'][^>]*>/i
    ) ||
    html.match(
      /<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*>/i
    );
  const description = decodeHtmlEntities((descMatch?.[1] || "").replace(/\s+/g, " ").trim());

  const links: string[] = [];
  const hrefRe = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html))) {
    links.push(m[1].trim());
  }

  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(header|nav|footer|aside)[\s\S]*?<\/\1>/gi, " ");

  cleaned = cleaned
    .replace(/<\/(p|div|section|article|li|h[1-6]|br|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const text = decodeHtmlEntities(cleaned)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return { title, description, text, links };
}

function resolveUrl(base: string, href: string): URL | null {
  try {
    if (
      !href ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("javascript:") ||
      href.startsWith("data:")
    ) {
      return null;
    }
    const url = new URL(href, base);
    url.hash = "";
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // Prefer https for public sites
    if (url.protocol === "http:") url.protocol = "https:";
    return url;
  } catch {
    return null;
  }
}

function isSameSite(url: URL, domain: string): boolean {
  const host = url.hostname.toLowerCase();
  return allowedHosts(domain).has(host);
}

function pathOf(url: URL): string {
  const path = url.pathname || "/";
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path || "/";
}

function shouldSkipPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (
    lower.startsWith("/api/") ||
    lower.startsWith("/admin") ||
    lower.startsWith("/_next/") ||
    lower.startsWith("/cdn-cgi/")
  ) {
    return true;
  }
  return /\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|map|pdf|zip|gz|mp4|webm|mp3|wav|woff2?|ttf|eot|xml|json)$/i.test(
    lower
  );
}

async function fetchText(
  url: string,
  accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
): Promise<{
  ok: boolean;
  status: number;
  text: string;
  finalUrl: string;
  etag: string;
  lastModified: string;
  contentType: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept,
        "user-agent": "AirsupSupiKnowledgeBot/1.0 (+https://airsup.app; site-agent knowledge index)",
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
      finalUrl: response.url || url,
      etag: response.headers.get("etag") || "",
      lastModified: response.headers.get("last-modified") || "",
      contentType,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      text: "",
      finalUrl: url,
      etag: "",
      lastModified: "",
      contentType: "",
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractSitemapLocs(xml: string): string[] {
  const locs: string[] = [];
  const re = /<loc>\s*([^<]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    locs.push(m[1].trim());
  }
  return locs;
}

async function discoverSeedUrls(domain: string): Promise<{ seeds: string[]; fingerprint: string }> {
  const root = normalizeDomain(domain);
  const origins = [`https://${root}`, `https://www.${root}`];
  const seeds = new Set<string>();
  const fingerprintParts: string[] = [];

  for (const origin of origins) {
    seeds.add(`${origin}/`);
  }

  // robots.txt sitemaps
  for (const origin of origins) {
    const robots = await fetchText(`${origin}/robots.txt`, "text/plain,*/*;q=0.8");
    if (!robots.ok) continue;
    fingerprintParts.push(`robots:${hashText(robots.text)}`);
    for (const line of robots.text.split(/\r?\n/)) {
      const match = line.match(/^\s*sitemap:\s*(\S+)/i);
      if (match?.[1]) seeds.add(match[1].trim());
    }
  }

  // Common sitemap locations
  for (const origin of origins) {
    seeds.add(`${origin}/sitemap.xml`);
    seeds.add(`${origin}/sitemap_index.xml`);
  }

  const queue = [...seeds];
  const seenSitemap = new Set<string>();
  const pageSeeds = new Set<string>(origins.map((o) => `${o}/`));

  while (queue.length && pageSeeds.size < MAX_PAGES * 2) {
    const next = queue.shift()!;
    if (seenSitemap.has(next)) continue;
    seenSitemap.add(next);

    const looksXml = /sitemap/i.test(next) || next.endsWith(".xml");
    if (!looksXml && !next.includes("sitemap")) continue;

    const res = await fetchText(next, "application/xml,text/xml,text/plain,*/*;q=0.8");
    if (!res.ok || !res.text) continue;
    fingerprintParts.push(`sitemap:${hashText(res.text)}`);
    const locs = extractSitemapLocs(res.text);
    const isIndex = /<sitemapindex/i.test(res.text);
    for (const loc of locs) {
      const url = resolveUrl(res.finalUrl, loc);
      if (!url || !isSameSite(url, root)) continue;
      if (isIndex || /sitemap/i.test(url.pathname)) {
        queue.push(url.toString());
      } else if (!shouldSkipPath(pathOf(url))) {
        pageSeeds.add(url.toString());
      }
    }
  }

  // Common content roots worth forcing even if sitemap is incomplete
  for (const origin of origins) {
    for (const path of ["/", "/about", "/blog", "/projects", "/work", "/contact", "/now", "/llms.txt"]) {
      pageSeeds.add(`${origin}${path}`);
    }
  }

  return {
    seeds: [...pageSeeds],
    fingerprint: hashText(fingerprintParts.sort().join("|")),
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      results.push(await worker(current));
    }
  });
  await Promise.all(runners);
  return results;
}

export async function crawlWebsite(domain: string): Promise<CrawlResult> {
  const root = normalizeDomain(domain);
  if (!root) {
    throw new Error("website domain required");
  }

  const cfg = supabaseConfig();
  // Skip airsup_mark_crawl — PostgREST can 404 it and abort indexing.
  // airsup_replace_pages alone is enough to persist crawl state.

  const started = Date.now();
  let error = "";
  const pages: SitePage[] = [];
  const seen = new Set<string>();
  const queue: string[] = [];

  try {
    const { seeds, fingerprint } = await discoverSeedUrls(root);
    for (const seed of seeds) {
      const url = resolveUrl(seed, seed);
      if (!url || !isSameSite(url, root) || shouldSkipPath(pathOf(url))) continue;
      const key = `${url.hostname}${pathOf(url)}${url.search}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(url.toString());
    }

    while (queue.length && pages.length < MAX_PAGES && Date.now() - started < CRAWL_BUDGET_MS) {
      const batch = queue.splice(0, Math.min(6, queue.length));
      const fetched = await mapPool(batch, 4, async (target) => {
        const res = await fetchText(target);
        return { target, res };
      });

      for (const { res } of fetched) {
        if (!res.ok || !res.text) continue;
        const finalUrl = resolveUrl(res.finalUrl, res.finalUrl);
        if (!finalUrl || !isSameSite(finalUrl, root)) continue;
        if (shouldSkipPath(pathOf(finalUrl))) continue;

        const contentType = res.contentType.toLowerCase();
        const isHtml =
          contentType.includes("text/html") ||
          contentType.includes("application/xhtml") ||
          (!contentType && /<html|<body|<main/i.test(res.text));
        const isText =
          contentType.includes("text/plain") ||
          contentType.includes("text/markdown") ||
          finalUrl.pathname.endsWith(".txt") ||
          finalUrl.pathname.endsWith(".md");

        if (!isHtml && !isText) continue;

        let title = "";
        let description = "";
        let content = "";
        let links: string[] = [];

        if (isHtml) {
          const parsed = stripHtml(res.text);
          title = parsed.title;
          description = parsed.description;
          content = parsed.text.slice(0, MAX_PAGE_CHARS);
          links = parsed.links;
        } else {
          title = pathOf(finalUrl);
          content = res.text.replace(/\s+/g, " ").trim().slice(0, MAX_PAGE_CHARS);
        }

        if (!content && !title) continue;

        const page: SitePage = {
          url: finalUrl.toString(),
          path: pathOf(finalUrl),
          title,
          description,
          content,
          contentHash: hashText(`${title}\n${description}\n${content}`),
          etag: res.etag,
          lastModified: res.lastModified,
          statusCode: res.status,
        };
        pages.push(page);

        for (const href of links) {
          if (pages.length + queue.length >= MAX_PAGES) break;
          const next = resolveUrl(finalUrl.toString(), href);
          if (!next || !isSameSite(next, root) || shouldSkipPath(pathOf(next))) continue;
          const key = `${next.hostname}${pathOf(next)}${next.search}`;
          if (seen.has(key)) continue;
          seen.add(key);
          queue.push(next.toString());
        }
      }
    }

    // Deduplicate by path (prefer apex content)
    const byPath = new Map<string, SitePage>();
    for (const page of pages) {
      const existing = byPath.get(page.path);
      if (!existing) {
        byPath.set(page.path, page);
        continue;
      }
      const preferNew =
        page.content.length > existing.content.length ||
        (!existing.url.includes("www.") && page.url.includes(normalizeDomain(root)));
      if (preferNew) byPath.set(page.path, page);
    }

    let total = 0;
    const compact: SitePage[] = [];
    for (const page of [...byPath.values()].sort((a, b) => {
      if (a.path === "/" && b.path !== "/") return -1;
      if (b.path === "/" && a.path !== "/") return 1;
      return a.path.localeCompare(b.path);
    })) {
      if (total >= MAX_TOTAL_CHARS) break;
      const room = MAX_TOTAL_CHARS - total;
      const clipped =
        page.content.length > room ? { ...page, content: page.content.slice(0, room) } : page;
      compact.push(clipped);
      total += clipped.content.length;
    }

    let meta: KnowledgeMeta = {
      websiteDomain: root,
      pageCount: compact.length,
      totalChars: total,
      crawlStatus: "ready",
      lastCrawlStartedAt: new Date(started).toISOString(),
      lastCrawlFinishedAt: new Date().toISOString(),
      lastChangeAt: new Date().toISOString(),
      sitemapFingerprint: fingerprint,
      lastError: "",
      updatedAt: new Date().toISOString(),
    };

    if (cfg) {
      await supabaseRpc("airsup_clear_pages", {
        p_token: cfg.token,
        p_website_domain: root,
      });
      for (const page of compact) {
        await supabaseRpc("airsup_upsert_page", {
          p_token: cfg.token,
          p_website_domain: root,
          p_url: page.url,
          p_path: page.path,
          p_title: page.title,
          p_description: page.description,
          p_content: page.content,
          p_content_hash: page.contentHash,
          p_etag: page.etag,
          p_last_modified: page.lastModified,
          p_status_code: page.statusCode,
        });
      }
      const finished = await supabaseRpc<KnowledgeMeta>("airsup_finish_crawl", {
        p_token: cfg.token,
        p_website_domain: root,
        p_sitemap_fingerprint: fingerprint,
        p_last_error: "",
      });
      if (finished) meta = finished;
    }

    return { meta, pages: compact };
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    if (cfg) {
      try {
        await supabaseRpc("airsup_finish_crawl", {
          p_token: cfg.token,
          p_website_domain: root,
          p_sitemap_fingerprint: "",
          p_last_error: error.slice(0, 500),
        });
      } catch {
        // ignore persistence failure while surfacing crawl error
      }
    }
    throw e;
  }
}

export async function getKnowledgeMeta(domain: string): Promise<KnowledgeMeta | null> {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  return supabaseRpc<KnowledgeMeta>("airsup_get_knowledge", {
    p_token: cfg.token,
    p_website_domain: normalizeDomain(domain),
  });
}

export async function listStoredPages(domain: string): Promise<SitePage[]> {
  const cfg = supabaseConfig();
  if (!cfg) return [];
  const pages = await supabaseRpc<SitePage[]>("airsup_list_pages", {
    p_token: cfg.token,
    p_website_domain: normalizeDomain(domain),
  });
  return pages || [];
}

export function isKnowledgeStale(meta: KnowledgeMeta | null | undefined): boolean {
  if (!meta || !meta.lastCrawlFinishedAt || meta.pageCount <= 0) return true;
  if (meta.crawlStatus === "error") return true;
  const finished = Date.parse(meta.lastCrawlFinishedAt);
  if (!Number.isFinite(finished)) return true;
  return Date.now() - finished > STALE_MS;
}

/**
 * Ensure knowledge is fresh enough for answering.
 * If stale/missing, crawl now (bounded). Always returns best-known pages.
 */
export async function ensureSiteKnowledge(
  domain: string,
  opts: { force?: boolean } = {}
): Promise<{ meta: KnowledgeMeta | null; pages: SitePage[]; refreshed: boolean }> {
  const root = normalizeDomain(domain);
  if (!root) return { meta: null, pages: [], refreshed: false };

  const meta = await getKnowledgeMeta(root);
  const needsRefresh = opts.force || isKnowledgeStale(meta);

  if (!needsRefresh) {
    const pages = await listStoredPages(root);
    return { meta, pages, refreshed: false };
  }

  // Avoid stampeding if a crawl is already in-flight (started < 90s ago).
  if (
    !opts.force &&
    meta?.crawlStatus === "crawling" &&
    meta.lastCrawlStartedAt &&
    Date.now() - Date.parse(meta.lastCrawlStartedAt) < 90_000
  ) {
    const pages = await listStoredPages(root);
    return { meta, pages, refreshed: false };
  }

  try {
    const result = await crawlWebsite(root);
    return { meta: result.meta, pages: result.pages, refreshed: true };
  } catch {
    const pages = await listStoredPages(root);
    const latest = await getKnowledgeMeta(root);
    return { meta: latest, pages, refreshed: false };
  }
}

export function buildKnowledgePromptBlock(
  domain: string,
  pages: SitePage[],
  meta: KnowledgeMeta | null
): string {
  const root = normalizeDomain(domain);
  if (!pages.length) {
    return `## AUTHORITATIVE WEBSITE KNOWLEDGE
No pages indexed yet for ${root}. If asked about site content you do not have here, reply exactly: I don't know.`;
  }

  const header = `## AUTHORITATIVE WEBSITE KNOWLEDGE (source of truth — prefer over training data)
Domain: ${root}
Indexed pages: ${meta?.pageCount ?? pages.length}
Last crawl finished: ${meta?.lastCrawlFinishedAt || "unknown"}
Last content change detected: ${meta?.lastChangeAt || "unknown"}
Use ONLY these pages as factual ground truth about the website and owner.
If the answer is not supported by this knowledge, reply exactly: I don't know.
Never invent pages, projects, or facts that are not present below.

`;

  let budget = Math.max(8_000, MAX_PROMPT_CHARS - header.length);
  const parts: string[] = [];

  for (const page of pages) {
    const block = `### ${page.path}
URL: ${page.url}
Title: ${page.title || "(untitled)"}
${page.description ? `Description: ${page.description}\n` : ""}Content:
${page.content}
`;
    if (block.length <= budget) {
      parts.push(block);
      budget -= block.length;
      continue;
    }
    if (budget < 500) break;
    parts.push(block.slice(0, budget) + "\n");
    break;
  }

  return header + parts.join("\n");
}

export async function refreshSiteKnowledgeInBackground(domain: string): Promise<void> {
  const root = normalizeDomain(domain);
  if (!root) return;
  // Fire-and-forget friendly wrapper.
  await ensureSiteKnowledge(root, { force: true });
}
