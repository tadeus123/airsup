/** Tool-use observability for Supi. Never log message bodies, tokens, or tool args. */

export type ToolCallTrace = {
  name: string;
  ok: boolean;
};

export type ToolTraceRecord = {
  id?: string;
  createdAt?: string;
  contextId: string;
  provider: string;
  toolsOffered: string[];
  toolsCalled: ToolCallTrace[];
  loops: number;
  calendarConnected: boolean;
  gmailConnected: boolean;
  intentCalendar: boolean;
  intentGmail: boolean;
  usedOk: boolean;
  missReason: string;
};

const CALENDAR_AVAILABILITY_TOOLS = new Set([
  "find_free_busy",
  "list_calendar_events",
]);

const CALENDAR_WRITE_TOOLS = new Set([
  "create_calendar_event",
  "update_calendar_event",
  "delete_calendar_event",
]);

const GMAIL_TOOLS = new Set([
  "list_gmail_messages",
  "read_gmail_message",
  "send_gmail",
  "trash_gmail_message",
  "delete_gmail_message",
  "list_gmail_drafts",
  "get_gmail_draft",
  "create_gmail_draft",
  "update_gmail_draft",
  "send_gmail_draft",
  "delete_gmail_draft",
]);

const CALENDAR_INTENT_RE =
  /\b(free|busy|availab|schedule|schedul|meeting|book(ing)?|calendar|slot|slots|open time|when (are|is|can)|next (call|meeting|slot)|reschedul|cancel (the )?(meeting|call|event)|move (the )?(meeting|call)|fly|flight|fl(y|ies|ying)|arriv(e|al|es|ing)|depart|trip|travel|itinerary|whereabouts|airport|boarding|when will)\b/i;

const GMAIL_INTENT_RE =
  /\b(email|e-mail|gmail|inbox|draft|mailbox|send (an? )?(mail|email)|reply to|forward|fly|flight|boarding|itinerary|ticket confirmation|arriv(e|al)|trip|travel)\b/i;

export function detectToolIntent(message: string): {
  intentCalendar: boolean;
  intentGmail: boolean;
} {
  const text = message.trim();
  if (!text) return { intentCalendar: false, intentGmail: false };
  return {
    intentCalendar: CALENDAR_INTENT_RE.test(text),
    intentGmail: GMAIL_INTENT_RE.test(text),
  };
}

export function toolResultOk(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as { error?: unknown };
    return parsed == null || parsed.error == null || parsed.error === "";
  } catch {
    return Boolean(raw?.trim());
  }
}

export function evaluateToolUse(input: {
  toolsOffered: string[];
  toolsCalled: ToolCallTrace[];
  calendarConnected: boolean;
  gmailConnected: boolean;
  intentCalendar: boolean;
  intentGmail: boolean;
}): { usedOk: boolean; missReason: string } {
  const names = new Set(input.toolsCalled.map((t) => t.name));
  const failed = input.toolsCalled.filter((t) => !t.ok).map((t) => t.name);

  if (failed.length) {
    return {
      usedOk: false,
      missReason: `tool_error:${failed.join(",")}`,
    };
  }

  if (
    input.intentCalendar &&
    input.calendarConnected &&
    input.toolsOffered.some((n) => CALENDAR_AVAILABILITY_TOOLS.has(n) || CALENDAR_WRITE_TOOLS.has(n))
  ) {
    const checkedAvailability = [...CALENDAR_AVAILABILITY_TOOLS].some((n) => names.has(n));
    const wroteCalendar = [...CALENDAR_WRITE_TOOLS].some((n) => names.has(n));
    if (!checkedAvailability && !wroteCalendar) {
      return {
        usedOk: false,
        missReason: "calendar_intent_without_calendar_tool",
      };
    }
  }

  if (
    input.intentGmail &&
    input.gmailConnected &&
    input.toolsOffered.some((n) => GMAIL_TOOLS.has(n))
  ) {
    const usedGmail = [...GMAIL_TOOLS].some((n) => names.has(n));
    if (!usedGmail) {
      return {
        usedOk: false,
        missReason: "gmail_intent_without_gmail_tool",
      };
    }
  }

  return { usedOk: true, missReason: "" };
}

export function logToolTraceSafe(trace: ToolTraceRecord): void {
  // Structured log for Vercel — names/flags only, no bodies or args.
  console.info(
    JSON.stringify({
      event: "airsup_tool_trace",
      contextId: trace.contextId,
      provider: trace.provider,
      toolsOffered: trace.toolsOffered,
      toolsCalled: trace.toolsCalled.map((t) => t.name),
      toolErrors: trace.toolsCalled.filter((t) => !t.ok).map((t) => t.name),
      loops: trace.loops,
      calendarConnected: trace.calendarConnected,
      gmailConnected: trace.gmailConnected,
      intentCalendar: trace.intentCalendar,
      intentGmail: trace.intentGmail,
      usedOk: trace.usedOk,
      missReason: trace.missReason || undefined,
    })
  );
}
