import { NextResponse } from "next/server";
import { callRealAgent, getConnection, publicOrigin } from "@/lib/connection";
import { customerSiteUrl, shouldHideSupiOnSetupHost } from "@/lib/host";

export const runtime = "nodejs";
export const maxDuration = 60;

function wantsHtml(request: Request, search: URLSearchParams): boolean {
  if (search.get("format") === "json") return false;
  if (search.get("format") === "html") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

function chatHtml(opts: {
  origin: string;
  reply: string;
  message: string;
  contextId: string;
  taskId: string;
}): string {
  const nextBase = `${opts.origin}/agent/chat`;
  const continueHint = `${nextBase}?contextId=${encodeURIComponent(opts.contextId)}&message=`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Supi chat</title>
  <style>
    body { margin:0; font-family: Georgia, serif; background:#fff; color:#111; }
    main { max-width: 40rem; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
    h1 { font-size: 1.8rem; margin: 0 0 0.75rem; }
    .box { border: 1px solid #e5e7eb; border-radius: 0.85rem; padding: 1rem; margin: 1rem 0; white-space: pre-wrap; }
    label { display:block; margin: 1rem 0 0.35rem; font-weight: 700; }
    input[type=text] { width:100%; padding:0.85rem 1rem; border:1px solid #e5e7eb; border-radius:0.85rem; font:inherit; }
    button { margin-top:0.75rem; border:0; border-radius:0.85rem; padding:0.85rem 1.2rem; background:#c8f542; font:inherit; font-weight:700; cursor:pointer; }
    code, a { word-break: break-all; }
    .meta { color:#6b7280; font-size:0.9rem; }
  </style>
</head>
<body>
  <main>
    <h1>Supi</h1>
    <p class="meta">Live conversation on the connected website. Keep the same contextId for back-and-forth.</p>
    <p><strong>You:</strong></p>
    <div class="box">${escapeHtml(opts.message)}</div>
    <p><strong>Supi:</strong></p>
    <div class="box">${escapeHtml(opts.reply)}</div>
    <p class="meta">contextId: <code>${escapeHtml(opts.contextId)}</code></p>
    <p><strong>AI agents / ChatGPT:</strong> to continue this discussion, open a URL like:</p>
    <p><code>${escapeHtml(continueHint)}YOUR_NEXT_MESSAGE</code></p>
    <p>Or use the form below (ChatGPT Agent Mode can fill it).</p>
    <form method="GET" action="${escapeHtml(nextBase)}">
      <input type="hidden" name="contextId" value="${escapeHtml(opts.contextId)}" />
      <input type="hidden" name="taskId" value="${escapeHtml(opts.taskId)}" />
      <label for="message">Your next message to Supi</label>
      <input id="message" name="message" type="text" required placeholder="How about Thursday at 15:00?" />
      <button type="submit">Send to Supi</button>
    </form>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function refuseConnectorChat(
  request: Request,
  connection: Awaited<ReturnType<typeof getConnection>>["connection"]
) {
  if (!shouldHideSupiOnSetupHost(request, connection)) return null;
  const url = new URL(request.url);
  const siteChat = customerSiteUrl(connection, `/agent/chat${url.search}`, request);
  if (siteChat) {
    return NextResponse.redirect(siteChat, 302);
  }
  return NextResponse.json(
    {
      error: "supi_not_on_connector",
      message:
        "Supi is not hosted on the Airsup setup site. Connect your website, then talk to Supi on that domain.",
    },
    { status: 404 }
  );
}

function readMessage(input: {
  message?: string | null;
  text?: string | null;
  q?: string | null;
}): string {
  return String(input.message ?? input.text ?? input.q ?? "").trim();
}

function missingMessageResponse(opts: {
  origin: string;
  contextId?: string;
}): NextResponse {
  const contextId = opts.contextId?.trim();
  const base = contextId
    ? `${opts.origin}/agent/chat?contextId=${encodeURIComponent(contextId)}&message=`
    : `${opts.origin}/agent/chat?message=`;
  return NextResponse.json(
    {
      error: "message is required",
      hint: "URL-encode your text and put it after message=. Do not GET continueUrl with an empty message value.",
      example: `${base}Hello%20Supi`,
      continueUrl: base,
    },
    { status: 400 }
  );
}

async function handleChat(
  _request: Request,
  input: { message: string; taskId?: string; contextId?: string }
) {
  const message = String(input.message ?? "").trim();
  if (!message) {
    return null;
  }
  const { connection } = await getConnection();
  const result = await callRealAgent(connection, message, {
    taskId: input.taskId,
    contextId: input.contextId,
  });
  return result;
}

export async function GET(request: Request) {
  try {
    const { connection } = await getConnection();
    const blocked = refuseConnectorChat(request, connection);
    if (blocked) return blocked;

    const url = new URL(request.url);
    const origin = publicOrigin(connection, url.origin, request);
    const message = readMessage({
      message: url.searchParams.get("message"),
      text: url.searchParams.get("text"),
      q: url.searchParams.get("q"),
    });
    const taskId = url.searchParams.get("taskId") || undefined;
    const contextId = url.searchParams.get("contextId") || undefined;
    const result = await handleChat(request, { message, taskId, contextId });
    if (!result) {
      return missingMessageResponse({ origin, contextId });
    }

    if (wantsHtml(request, url.searchParams)) {
      return new NextResponse(
        chatHtml({
          origin,
          reply: result.reply,
          message,
          contextId: result.contextId || "",
          taskId: result.taskId || "",
        }),
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }

    const continueUrl = `${origin}/agent/chat?contextId=${encodeURIComponent(result.contextId || "")}&message=`;
    return NextResponse.json({
      ...result,
      continueUrl,
      hint: "Append a URL-encoded next message after message= then GET that full URL. Empty message= returns 400.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "agent_failed" },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { connection } = await getConnection();
    const blocked = refuseConnectorChat(request, connection);
    if (blocked) return blocked;

    const body = (await request.json()) as {
      message?: string;
      text?: string;
      q?: string;
      taskId?: string;
      contextId?: string;
    };
    const origin = publicOrigin(connection, new URL(request.url).origin, request);
    const message = readMessage(body);
    const result = await handleChat(request, {
      message,
      taskId: body.taskId,
      contextId: body.contextId,
    });
    if (!result) {
      return missingMessageResponse({ origin, contextId: body.contextId });
    }
    const continueUrl = `${origin}/agent/chat?contextId=${encodeURIComponent(result.contextId || "")}&message=`;
    return NextResponse.json({
      ...result,
      continueUrl,
      hint: "Append a URL-encoded next message after message= then GET that full URL. Empty message= returns 400.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "agent_failed" },
      { status: 502 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    },
  });
}
