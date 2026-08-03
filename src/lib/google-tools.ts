import { getValidAccessToken } from "./google-oauth";

export type AgentToolDefinition = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export const CALENDAR_AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: "list_calendar_events",
    description:
      "List events on the website owner's primary Google Calendar. Use for availability, existing meetings, AND travel/whereabouts (flights, trips, arrivals, city visits) before saying you don't know.",
    parameters: {
      type: "object",
      properties: {
        timeMin: {
          type: "string",
          description: "RFC3339 start (inclusive). Defaults to now.",
        },
        timeMax: {
          type: "string",
          description: "RFC3339 end (exclusive). Defaults to 14 days from now.",
        },
        maxResults: {
          type: "integer",
          description: "Max events to return (1-20). Default 10.",
        },
        query: {
          type: "string",
          description: "Optional free-text search across event fields.",
        },
      },
    },
  },
  {
    name: "create_calendar_event",
    description:
      "Create a Google Calendar event on the website owner's calendar and optionally invite guests.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Event title." },
        description: { type: "string", description: "Event details." },
        location: { type: "string", description: "Location or meeting link." },
        start: {
          type: "string",
          description:
            "RFC3339 start datetime with offset, e.g. 2026-08-07T15:00:00+02:00",
        },
        end: {
          type: "string",
          description: "RFC3339 end datetime with offset.",
        },
        attendeeEmails: {
          type: "array",
          items: { type: "string" },
          description: "Guest email addresses to invite.",
        },
        timezone: {
          type: "string",
          description: "IANA timezone. Defaults to OWNER_TIMEZONE / WEBSITE_TIMEZONE / UTC.",
        },
      },
      required: ["summary", "start", "end"],
    },
  },
  {
    name: "update_calendar_event",
    description: "Update an existing Google Calendar event by event id.",
    parameters: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        summary: { type: "string" },
        description: { type: "string" },
        location: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
        attendeeEmails: { type: "array", items: { type: "string" } },
        timezone: { type: "string" },
      },
      required: ["eventId"],
    },
  },
  {
    name: "delete_calendar_event",
    description: "Delete a Google Calendar event by event id.",
    parameters: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        sendUpdates: {
          type: "string",
          enum: ["all", "externalOnly", "none"],
          description: "Whether to notify attendees. Default all.",
        },
      },
      required: ["eventId"],
    },
  },
  {
    name: "find_free_busy",
    description:
      "REQUIRED before proposing any free/open call slots. Returns busy intervals on the website owner's primary Google Calendar for a time range. Call this (or list_calendar_events) whenever the visitor asks when someone is free or available.",
    parameters: {
      type: "object",
      properties: {
        timeMin: { type: "string", description: "RFC3339 start." },
        timeMax: { type: "string", description: "RFC3339 end." },
      },
      required: ["timeMin", "timeMax"],
    },
  },
];

export const GMAIL_AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: "list_gmail_messages",
    description:
      "List/search messages in the website owner's Gmail. Use for inbox questions AND to find travel/flight/boarding/itinerary/booking confirmations before saying you don't know.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Gmail search query, e.g. newer_than:7d OR from:alice@x.com",
        },
        labelIds: {
          type: "array",
          items: { type: "string" },
          description: "Optional label ids, e.g. INBOX, SENT, DRAFT.",
        },
        maxResults: {
          type: "integer",
          description: "1-15. Default 8.",
        },
      },
    },
  },
  {
    name: "read_gmail_message",
    description: "Read a full Gmail message by id (headers + plain-text body).",
    parameters: {
      type: "object",
      properties: {
        messageId: { type: "string" },
      },
      required: ["messageId"],
    },
  },
  {
    name: "send_gmail",
    description: "Send an email from the website owner's Gmail account.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email." },
        subject: { type: "string" },
        body: { type: "string", description: "Plain-text body." },
        cc: { type: "string" },
        bcc: { type: "string" },
        threadId: {
          type: "string",
          description: "Optional thread id to reply in an existing thread.",
        },
        inReplyTo: {
          type: "string",
          description: "Optional Message-ID header value when replying.",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "trash_gmail_message",
    description: "Move a Gmail message to Trash.",
    parameters: {
      type: "object",
      properties: { messageId: { type: "string" } },
      required: ["messageId"],
    },
  },
  {
    name: "delete_gmail_message",
    description:
      "Permanently delete a Gmail message (cannot be undone). Prefer trash_gmail_message unless permanent delete is required.",
    parameters: {
      type: "object",
      properties: { messageId: { type: "string" } },
      required: ["messageId"],
    },
  },
  {
    name: "list_gmail_drafts",
    description: "List Gmail drafts for the website owner.",
    parameters: {
      type: "object",
      properties: {
        maxResults: {
          type: "integer",
          description: "1-15. Default 8.",
        },
        query: {
          type: "string",
          description: "Optional Gmail search query scoped to drafts.",
        },
      },
    },
  },
  {
    name: "get_gmail_draft",
    description: "Get a Gmail draft by draft id.",
    parameters: {
      type: "object",
      properties: { draftId: { type: "string" } },
      required: ["draftId"],
    },
  },
  {
    name: "create_gmail_draft",
    description: "Create a Gmail draft (does not send).",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
        cc: { type: "string" },
        bcc: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "update_gmail_draft",
    description: "Replace the contents of an existing Gmail draft.",
    parameters: {
      type: "object",
      properties: {
        draftId: { type: "string" },
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
        cc: { type: "string" },
        bcc: { type: "string" },
      },
      required: ["draftId", "to", "subject", "body"],
    },
  },
  {
    name: "send_gmail_draft",
    description: "Send an existing Gmail draft.",
    parameters: {
      type: "object",
      properties: { draftId: { type: "string" } },
      required: ["draftId"],
    },
  },
  {
    name: "delete_gmail_draft",
    description: "Delete a Gmail draft permanently.",
    parameters: {
      type: "object",
      properties: { draftId: { type: "string" } },
      required: ["draftId"],
    },
  },
];

/** @deprecated prefer toolsForGoogleConnections */
export const GOOGLE_AGENT_TOOLS: AgentToolDefinition[] = [
  ...CALENDAR_AGENT_TOOLS,
  ...GMAIL_AGENT_TOOLS,
];

export function toolsForGoogleConnections(opts: {
  calendarConnected: boolean;
  gmailConnected: boolean;
}): AgentToolDefinition[] | undefined {
  const tools: AgentToolDefinition[] = [];
  if (opts.calendarConnected) tools.push(...CALENDAR_AGENT_TOOLS);
  if (opts.gmailConnected) tools.push(...GMAIL_AGENT_TOOLS);
  return tools.length ? tools : undefined;
}

const CALENDAR_TOOL_NAMES = new Set(CALENDAR_AGENT_TOOLS.map((t) => t.name));
const GMAIL_TOOL_NAMES = new Set(GMAIL_AGENT_TOOLS.map((t) => t.name));

async function googleFetch(
  path: string,
  init: RequestInit & { accessToken: string }
): Promise<unknown> {
  const { accessToken, ...rest } = init;
  const response = await fetch(path, {
    ...rest,
    headers: {
      ...(rest.headers || {}),
      authorization: `Bearer ${accessToken}`,
    },
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    const err =
      json && typeof json === "object" && "error" in json
        ? (json as { error?: { message?: string } }).error?.message
        : undefined;
    throw new Error(err || `Google API HTTP ${response.status}`);
  }
  return json;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function defaultOwnerTimezone(): string {
  return (
    process.env.OWNER_TIMEZONE?.trim() ||
    process.env.WEBSITE_TIMEZONE?.trim() ||
    "UTC"
  );
}

function buildMime(opts: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  inReplyTo?: string;
}): string {
  const lines = [
    `To: ${opts.to}`,
    ...(opts.cc ? [`Cc: ${opts.cc}`] : []),
    ...(opts.bcc ? [`Bcc: ${opts.bcc}`] : []),
    ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`, `References: ${opts.inReplyTo}`] : []),
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    opts.body,
  ];
  return Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: GmailHeader[];
};

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  return (
    headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || ""
  );
}

function decodeBodyData(data?: string): string {
  if (!data) return "";
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8"
    );
  } catch {
    return "";
  }
}

function extractPlainText(payload?: GmailPart): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBodyData(payload.body.data);
  }
  for (const part of payload.parts || []) {
    const text = extractPlainText(part);
    if (text) return text;
  }
  if (payload.body?.data) return decodeBodyData(payload.body.data);
  return "";
}

function summarizeMessage(full: {
  id?: string;
  threadId?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailPart;
}) {
  const headers = full.payload?.headers || [];
  return {
    id: full.id,
    threadId: full.threadId,
    subject: headerValue(headers, "Subject"),
    from: headerValue(headers, "From"),
    to: headerValue(headers, "To"),
    cc: headerValue(headers, "Cc"),
    date: headerValue(headers, "Date"),
    snippet: full.snippet,
    labelIds: full.labelIds || [],
  };
}

export async function executeGoogleTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const needsGmail = GMAIL_TOOL_NAMES.has(name);
  const needsCalendar = CALENDAR_TOOL_NAMES.has(name);
  const service = needsGmail ? "gmail" : "calendar";

  if (!needsGmail && !needsCalendar) {
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  const auth = await getValidAccessToken(service);
  if (!auth) {
    return JSON.stringify({
      error: needsGmail ? "gmail_not_connected" : "calendar_not_connected",
      message: needsGmail
        ? "The website owner has not connected Gmail yet. Ask them to open /domain/setup and click Connect Gmail."
        : "The website owner has not connected Google Calendar yet. Ask them to open /domain/setup and connect Google Calendar.",
    });
  }

  try {
    switch (name) {
      case "list_calendar_events":
        return await listEvents(auth.accessToken, args);
      case "create_calendar_event":
        return await createEvent(auth.accessToken, args);
      case "update_calendar_event":
        return await updateEvent(auth.accessToken, args);
      case "delete_calendar_event":
        return await deleteEvent(auth.accessToken, args);
      case "find_free_busy":
        return await freeBusy(auth.accessToken, args, auth.email);
      case "list_gmail_messages":
        return await listGmail(auth.accessToken, args);
      case "read_gmail_message":
        return await readGmail(auth.accessToken, args);
      case "send_gmail":
        return await sendGmail(auth.accessToken, args);
      case "trash_gmail_message":
        return await trashGmail(auth.accessToken, args);
      case "delete_gmail_message":
        return await deleteGmail(auth.accessToken, args);
      case "list_gmail_drafts":
        return await listDrafts(auth.accessToken, args);
      case "get_gmail_draft":
        return await getDraft(auth.accessToken, args);
      case "create_gmail_draft":
        return await createDraft(auth.accessToken, args);
      case "update_gmail_draft":
        return await updateDraft(auth.accessToken, args);
      case "send_gmail_draft":
        return await sendDraft(auth.accessToken, args);
      case "delete_gmail_draft":
        return await deleteDraft(auth.accessToken, args);
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : "tool_failed",
    });
  }
}

async function listEvents(accessToken: string, args: Record<string, unknown>) {
  const now = new Date();
  const timeMin = String(args.timeMin || now.toISOString());
  const timeMax = String(
    args.timeMax || new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
  );
  const maxResults = clampInt(args.maxResults, 10, 1, 20);
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin,
    timeMax,
    maxResults: String(maxResults),
  });
  if (args.query) params.set("q", String(args.query));

  const json = (await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { method: "GET", accessToken }
  )) as {
    items?: Array<{
      id?: string;
      summary?: string;
      description?: string;
      location?: string;
      htmlLink?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      attendees?: Array<{ email?: string; responseStatus?: string }>;
      status?: string;
    }>;
  };

  return JSON.stringify({
    events: (json.items || []).map((e) => ({
      id: e.id,
      summary: e.summary,
      description: e.description,
      location: e.location,
      htmlLink: e.htmlLink,
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      status: e.status,
      attendees: e.attendees?.map((a) => ({
        email: a.email,
        responseStatus: a.responseStatus,
      })),
    })),
  });
}

async function createEvent(accessToken: string, args: Record<string, unknown>) {
  const timezone = String(args.timezone || defaultOwnerTimezone());
  const attendees = Array.isArray(args.attendeeEmails)
    ? args.attendeeEmails
        .map((e) => String(e).trim())
        .filter(Boolean)
        .map((email) => ({ email }))
    : [];

  const body = {
    summary: String(args.summary || "Meeting"),
    description: args.description ? String(args.description) : undefined,
    location: args.location ? String(args.location) : undefined,
    start: { dateTime: String(args.start), timeZone: timezone },
    end: { dateTime: String(args.end), timeZone: timezone },
    attendees: attendees.length ? attendees : undefined,
  };

  const params = new URLSearchParams({
    sendUpdates: attendees.length ? "all" : "none",
  });

  const json = (await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    {
      method: "POST",
      accessToken,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  )) as {
    id?: string;
    htmlLink?: string;
    summary?: string;
    start?: { dateTime?: string };
    end?: { dateTime?: string };
  };

  return JSON.stringify({
    ok: true,
    id: json.id,
    htmlLink: json.htmlLink,
    summary: json.summary,
    start: json.start?.dateTime,
    end: json.end?.dateTime,
  });
}

async function updateEvent(accessToken: string, args: Record<string, unknown>) {
  const eventId = String(args.eventId || "").trim();
  if (!eventId) throw new Error("eventId is required");
  const timezone = String(args.timezone || defaultOwnerTimezone());
  const patch: Record<string, unknown> = {};
  if (args.summary) patch.summary = String(args.summary);
  if (args.description !== undefined) patch.description = String(args.description);
  if (args.location !== undefined) patch.location = String(args.location);
  if (args.start) patch.start = { dateTime: String(args.start), timeZone: timezone };
  if (args.end) patch.end = { dateTime: String(args.end), timeZone: timezone };
  if (Array.isArray(args.attendeeEmails)) {
    patch.attendees = args.attendeeEmails
      .map((e) => String(e).trim())
      .filter(Boolean)
      .map((email) => ({ email }));
  }

  const params = new URLSearchParams({ sendUpdates: "all" });
  const json = (await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?${params}`,
    {
      method: "PATCH",
      accessToken,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }
  )) as { id?: string; htmlLink?: string; summary?: string };

  return JSON.stringify({
    ok: true,
    id: json.id,
    htmlLink: json.htmlLink,
    summary: json.summary,
  });
}

async function deleteEvent(accessToken: string, args: Record<string, unknown>) {
  const eventId = String(args.eventId || "").trim();
  if (!eventId) throw new Error("eventId is required");
  const sendUpdates = String(args.sendUpdates || "all");
  const params = new URLSearchParams({ sendUpdates });
  await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?${params}`,
    { method: "DELETE", accessToken }
  );
  return JSON.stringify({ ok: true, deleted: eventId });
}

async function freeBusy(
  accessToken: string,
  args: Record<string, unknown>,
  email: string
) {
  const json = (await googleFetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    accessToken,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      timeMin: String(args.timeMin),
      timeMax: String(args.timeMax),
      items: [{ id: "primary" }],
    }),
  })) as {
    calendars?: Record<string, { busy?: Array<{ start?: string; end?: string }> }>;
  };

  return JSON.stringify({
    email,
    busy: json.calendars?.primary?.busy || [],
  });
}

async function listGmail(accessToken: string, args: Record<string, unknown>) {
  const maxResults = clampInt(args.maxResults, 8, 1, 15);
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (args.query) params.set("q", String(args.query));
  if (Array.isArray(args.labelIds)) {
    for (const id of args.labelIds) {
      if (id) params.append("labelIds", String(id));
    }
  }

  const list = (await googleFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
    { method: "GET", accessToken }
  )) as { messages?: Array<{ id?: string }> };

  const messages = [];
  for (const m of list.messages || []) {
    if (!m.id) continue;
    const full = (await googleFetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date&metadataHeaders=Cc`,
      { method: "GET", accessToken }
    )) as {
      id?: string;
      threadId?: string;
      snippet?: string;
      labelIds?: string[];
      payload?: GmailPart;
    };
    messages.push(summarizeMessage(full));
  }

  return JSON.stringify({ messages });
}

async function readGmail(accessToken: string, args: Record<string, unknown>) {
  const messageId = String(args.messageId || "").trim();
  if (!messageId) throw new Error("messageId is required");
  const full = (await googleFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
    { method: "GET", accessToken }
  )) as {
    id?: string;
    threadId?: string;
    snippet?: string;
    labelIds?: string[];
    payload?: GmailPart;
  };
  return JSON.stringify({
    ...summarizeMessage(full),
    body: extractPlainText(full.payload).slice(0, 12000),
  });
}

async function sendGmail(accessToken: string, args: Record<string, unknown>) {
  const to = String(args.to || "").trim();
  const subject = String(args.subject || "").trim();
  const body = String(args.body || "");
  const cc = String(args.cc || "").trim();
  const bcc = String(args.bcc || "").trim();
  const threadId = String(args.threadId || "").trim();
  const inReplyTo = String(args.inReplyTo || "").trim();
  if (!to || !subject) throw new Error("to and subject are required");

  const payload: Record<string, unknown> = {
    raw: buildMime({ to, subject, body, cc, bcc, inReplyTo }),
  };
  if (threadId) payload.threadId = threadId;

  const json = (await googleFetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      accessToken,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }
  )) as { id?: string; threadId?: string };

  return JSON.stringify({ ok: true, id: json.id, threadId: json.threadId });
}

async function trashGmail(accessToken: string, args: Record<string, unknown>) {
  const messageId = String(args.messageId || "").trim();
  if (!messageId) throw new Error("messageId is required");
  const json = (await googleFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/trash`,
    { method: "POST", accessToken }
  )) as { id?: string };
  return JSON.stringify({ ok: true, id: json.id, trashed: true });
}

async function deleteGmail(accessToken: string, args: Record<string, unknown>) {
  const messageId = String(args.messageId || "").trim();
  if (!messageId) throw new Error("messageId is required");
  await googleFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`,
    { method: "DELETE", accessToken }
  );
  return JSON.stringify({ ok: true, deleted: messageId });
}

async function listDrafts(accessToken: string, args: Record<string, unknown>) {
  const maxResults = clampInt(args.maxResults, 8, 1, 15);
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (args.query) params.set("q", String(args.query));

  const list = (await googleFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/drafts?${params}`,
    { method: "GET", accessToken }
  )) as { drafts?: Array<{ id?: string; message?: { id?: string } }> };

  const drafts = [];
  for (const d of list.drafts || []) {
    if (!d.id) continue;
    const full = (await googleFetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(d.id)}`,
      { method: "GET", accessToken }
    )) as {
      id?: string;
      message?: {
        id?: string;
        threadId?: string;
        snippet?: string;
        labelIds?: string[];
        payload?: GmailPart;
      };
    };
    drafts.push({
      draftId: full.id,
      message: summarizeMessage(full.message || {}),
    });
  }
  return JSON.stringify({ drafts });
}

async function getDraft(accessToken: string, args: Record<string, unknown>) {
  const draftId = String(args.draftId || "").trim();
  if (!draftId) throw new Error("draftId is required");
  const full = (await googleFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}?format=full`,
    { method: "GET", accessToken }
  )) as {
    id?: string;
    message?: {
      id?: string;
      threadId?: string;
      snippet?: string;
      labelIds?: string[];
      payload?: GmailPart;
    };
  };
  return JSON.stringify({
    draftId: full.id,
    message: {
      ...summarizeMessage(full.message || {}),
      body: extractPlainText(full.message?.payload).slice(0, 12000),
    },
  });
}

async function createDraft(accessToken: string, args: Record<string, unknown>) {
  const to = String(args.to || "").trim();
  const subject = String(args.subject || "").trim();
  const body = String(args.body || "");
  const cc = String(args.cc || "").trim();
  const bcc = String(args.bcc || "").trim();
  if (!to || !subject) throw new Error("to and subject are required");

  const json = (await googleFetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
    {
      method: "POST",
      accessToken,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: { raw: buildMime({ to, subject, body, cc, bcc }) },
      }),
    }
  )) as { id?: string; message?: { id?: string; threadId?: string } };

  return JSON.stringify({
    ok: true,
    draftId: json.id,
    messageId: json.message?.id,
    threadId: json.message?.threadId,
  });
}

async function updateDraft(accessToken: string, args: Record<string, unknown>) {
  const draftId = String(args.draftId || "").trim();
  const to = String(args.to || "").trim();
  const subject = String(args.subject || "").trim();
  const body = String(args.body || "");
  const cc = String(args.cc || "").trim();
  const bcc = String(args.bcc || "").trim();
  if (!draftId) throw new Error("draftId is required");
  if (!to || !subject) throw new Error("to and subject are required");

  const json = (await googleFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}`,
    {
      method: "PUT",
      accessToken,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: draftId,
        message: { raw: buildMime({ to, subject, body, cc, bcc }) },
      }),
    }
  )) as { id?: string; message?: { id?: string; threadId?: string } };

  return JSON.stringify({
    ok: true,
    draftId: json.id,
    messageId: json.message?.id,
    threadId: json.message?.threadId,
  });
}

async function sendDraft(accessToken: string, args: Record<string, unknown>) {
  const draftId = String(args.draftId || "").trim();
  if (!draftId) throw new Error("draftId is required");
  const json = (await googleFetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/drafts/send",
    {
      method: "POST",
      accessToken,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: draftId }),
    }
  )) as { id?: string; threadId?: string };
  return JSON.stringify({ ok: true, id: json.id, threadId: json.threadId, sent: true });
}

async function deleteDraft(accessToken: string, args: Record<string, unknown>) {
  const draftId = String(args.draftId || "").trim();
  if (!draftId) throw new Error("draftId is required");
  await googleFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}`,
    { method: "DELETE", accessToken }
  );
  return JSON.stringify({ ok: true, deleted: draftId });
}
