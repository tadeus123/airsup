import { executeGoogleTool } from "./google-tools";
import { detectToolIntent, toolResultOk, type ToolCallTrace } from "./tool-trace";

const STOP = new Set([
  "a",
  "an",
  "the",
  "to",
  "for",
  "of",
  "and",
  "or",
  "when",
  "will",
  "he",
  "she",
  "they",
  "his",
  "her",
  "their",
  "ask",
  "please",
  "give",
  "exact",
  "date",
  "time",
  "times",
  "there",
  "here",
  "from",
  "with",
  "about",
  "what",
  "where",
  "who",
  "how",
  "does",
  "is",
  "are",
  "be",
  "on",
  "in",
  "at",
  "into",
  "tade",
  "tademehl",
  "supi",
]);

const TRAVEL_RE =
  /\b(fly|flight|fl(y|ies|ying)|arriv(e|al|es|ing)|depart|trip|travel|itinerary|boarding|whereabouts|airport|hotel|train|plane|landing)\b/i;

/** Personal / operational facts that live in Calendar or Gmail, not the website crawl. */
export function needsLiveLookup(message: string): boolean {
  const { intentCalendar, intentGmail } = detectToolIntent(message);
  if (intentCalendar || intentGmail) return true;
  return TRAVEL_RE.test(message);
}

export function looksLikeDontKnow(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  if (/^i don't know\.?$/.test(t)) return true;
  if (/^i do not know\.?$/.test(t)) return true;
  return (
    /\bi don't know\b/.test(t) &&
    t.length < 220 &&
    !/\b(found|calendar|event|email|flight|depart|arriv)/i.test(t)
  );
}

export function extractLookupKeywords(message: string): string[] {
  const raw = message
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const w of raw) {
    const lower = w.toLowerCase();
    if (lower.length < 3) continue;
    if (STOP.has(lower)) continue;
    if (!out.some((x) => x.toLowerCase() === lower)) out.push(w);
    if (out.length >= 6) break;
  }
  return out;
}

export type LivePrefetch = {
  block: string;
  toolsCalled: ToolCallTrace[];
  calendarHitCount: number;
  gmailHitCount: number;
};

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function runTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ name: string; ok: boolean; raw: string }> {
  const raw = await executeGoogleTool(name, args);
  return { name, ok: toolResultOk(raw), raw };
}

/**
 * Fast deterministic Calendar/Gmail prefetch.
 * Parallel, small payloads — keep ChatGPT under ~15s total.
 */
export async function prefetchLiveContext(opts: {
  message: string;
  calendarConnected: boolean;
  gmailConnected: boolean;
}): Promise<LivePrefetch | null> {
  if (!needsLiveLookup(opts.message)) return null;
  if (!opts.calendarConnected && !opts.gmailConnected) return null;

  const keywords = extractLookupKeywords(opts.message);
  const travel = TRAVEL_RE.test(opts.message);
  const { intentGmail } = detectToolIntent(opts.message);
  const wantGmail = opts.gmailConnected && (travel || intentGmail);
  const wantCalendar = opts.calendarConnected;

  const toolsCalled: ToolCallTrace[] = [];
  const parts: string[] = [];
  let calendarHitCount = 0;
  let gmailHitCount = 0;

  const jobs: Array<Promise<{ kind: string; name: string; ok: boolean; raw: string; q?: string }>> =
    [];

  if (wantCalendar) {
    // One compact window — enough for availability + near-term travel.
    jobs.push(
      runTool("list_calendar_events", {
        timeMin: daysAgo(travel ? 7 : 1),
        timeMax: daysFromNow(travel ? 60 : 14),
        maxResults: travel ? 25 : 15,
        ...(keywords[0] ? { query: keywords.slice(0, 3).join(" ") } : {}),
      }).then((r) => ({ kind: "calendar", ...r }))
    );
  }

  if (wantGmail) {
    const terms = unique([
      ...keywords.slice(0, 4),
      ...(travel ? ["flight", "boarding", "itinerary", "ticket"] : []),
    ]);
    const query = `(${terms.join(" OR ")}) newer_than:${travel ? "120d" : "30d"}`;
    jobs.push(
      runTool("list_gmail_messages", {
        query,
        maxResults: travel ? 6 : 5,
      }).then((r) => ({ kind: "gmail-list", ...r, q: query }))
    );
  }

  const settled = await Promise.all(jobs);

  let gmailListRaw: string | null = null;
  for (const item of settled) {
    toolsCalled.push({ name: item.name, ok: item.ok });
    if (item.kind === "calendar") {
      parts.push(`CALENDAR_EVENTS:\n${item.raw}`);
      try {
        const parsed = JSON.parse(item.raw) as { events?: unknown[] };
        calendarHitCount += parsed.events?.length || 0;
      } catch {
        /* ignore */
      }
    }
    if (item.kind === "gmail-list") {
      gmailListRaw = item.raw;
      parts.push(`GMAIL_SEARCH${item.q ? ` (${item.q})` : ""}:\n${item.raw}`);
      try {
        const parsed = JSON.parse(item.raw) as { messages?: unknown[] };
        gmailHitCount += parsed.messages?.length || 0;
      } catch {
        /* ignore */
      }
    }
  }

  // At most 2 full email reads, and only for travel (snippets usually enough otherwise).
  if (travel && gmailListRaw) {
    try {
      const parsed = JSON.parse(gmailListRaw) as {
        messages?: Array<{ id?: string }>;
      };
      const ids = (parsed.messages || []).map((m) => m.id).filter(Boolean).slice(0, 2) as string[];
      if (ids.length) {
        const reads = await Promise.all(
          ids.map((id) =>
            runTool("read_gmail_message", { messageId: id }).then((r) => ({
              id,
              ...r,
            }))
          )
        );
        for (const read of reads) {
          toolsCalled.push({ name: read.name, ok: read.ok });
          parts.push(`GMAIL_MESSAGE ${read.id}:\n${read.raw}`);
        }
      }
    } catch {
      /* ignore */
    }
  }

  const block = `LIVE LOOKUP RESULTS (already fetched for this turn — authoritative for calendar/email/travel questions):
Use these results to answer. Do NOT reply "I don't know" if they contain a relevant event, flight, trip, city, or arrival/departure.
If nothing relevant appears below after these lookups, then say you checked Calendar/Gmail and found nothing matching.

${parts.join("\n\n")}`;

  return { block, toolsCalled, calendarHitCount, gmailHitCount };
}

function unique(values: string[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}
