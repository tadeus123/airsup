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

/** Personal / operational facts that live in Calendar or Gmail, not the website crawl. */
export function needsLiveLookup(message: string): boolean {
  const { intentCalendar, intentGmail } = detectToolIntent(message);
  if (intentCalendar || intentGmail) return true;
  return /\b(plan|plans|going|visit|visiting|city|hotel|train|plane|land|landing|leave|leaving|return|returning|out of (town|office)|ooo|busy (on|this)|next week|this week|tomorrow|tonight)\b/i.test(
    message
  );
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
    if (out.length >= 8) break;
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

/**
 * Deterministically fetch Calendar/Gmail before the LLM answers.
 * Stops "I don't know" when the model forgets to call tools.
 */
export async function prefetchLiveContext(opts: {
  message: string;
  calendarConnected: boolean;
  gmailConnected: boolean;
}): Promise<LivePrefetch | null> {
  if (!needsLiveLookup(opts.message)) return null;
  if (!opts.calendarConnected && !opts.gmailConnected) return null;

  const keywords = extractLookupKeywords(opts.message);
  const toolsCalled: ToolCallTrace[] = [];
  const parts: string[] = [];
  let calendarHitCount = 0;
  let gmailHitCount = 0;

  if (opts.calendarConnected) {
    const wide = await executeGoogleTool("list_calendar_events", {
      timeMin: daysAgo(14),
      timeMax: daysFromNow(120),
      maxResults: 40,
    });
    toolsCalled.push({ name: "list_calendar_events", ok: toolResultOk(wide) });
    parts.push(`CALENDAR_EVENTS_WIDE_WINDOW (-14d … +120d):\n${wide}`);
    try {
      const parsed = JSON.parse(wide) as { events?: unknown[] };
      calendarHitCount += parsed.events?.length || 0;
    } catch {
      /* ignore */
    }

    if (keywords.length) {
      const q = keywords.slice(0, 5).join(" ");
      const searched = await executeGoogleTool("list_calendar_events", {
        timeMin: daysAgo(30),
        timeMax: daysFromNow(180),
        maxResults: 25,
        query: q,
      });
      toolsCalled.push({
        name: "list_calendar_events",
        ok: toolResultOk(searched),
      });
      parts.push(`CALENDAR_EVENTS_SEARCH (q=${q}):\n${searched}`);
      try {
        const parsed = JSON.parse(searched) as { events?: unknown[] };
        calendarHitCount += parsed.events?.length || 0;
      } catch {
        /* ignore */
      }
    }
  }

  if (opts.gmailConnected) {
    const terms = [
      ...keywords.slice(0, 5),
      "flight",
      "boarding",
      "itinerary",
      "ticket",
      "booking",
      "train",
      "hotel",
    ];
    const unique = [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
    const query = `(${unique.join(" OR ")}) newer_than:180d`;
    const listed = await executeGoogleTool("list_gmail_messages", {
      query,
      maxResults: 12,
    });
    toolsCalled.push({ name: "list_gmail_messages", ok: toolResultOk(listed) });
    parts.push(`GMAIL_SEARCH (query=${query}):\n${listed}`);

    try {
      const parsed = JSON.parse(listed) as {
        messages?: Array<{ id?: string; snippet?: string }>;
      };
      const msgs = parsed.messages || [];
      gmailHitCount += msgs.length;
      for (const m of msgs.slice(0, 4)) {
        if (!m.id) continue;
        const full = await executeGoogleTool("read_gmail_message", {
          messageId: m.id,
        });
        toolsCalled.push({
          name: "read_gmail_message",
          ok: toolResultOk(full),
        });
        parts.push(`GMAIL_MESSAGE ${m.id}:\n${full}`);
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
