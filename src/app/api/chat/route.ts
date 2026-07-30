import { NextResponse } from "next/server";
import { callRealAgent, getConnection, publicOrigin } from "@/lib/connection";

export const runtime = "nodejs";

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
    <p class="meta">Live conversation. Keep the same contextId for back-and-forth.</p>
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

async function handleChat(
  request: Request,
  input: { message: string; taskId?: string; contextId?: string }
) {
  const message = String(input.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
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
    const url = new URL(request.url);
    const message = url.searchParams.get("message") || "";
    const taskId = url.searchParams.get("taskId") || undefined;
    const contextId = url.searchParams.get("contextId") || undefined;
    const result = await handleChat(request, { message, taskId, contextId });
    if (result instanceof NextResponse) return result;

    const { connection } = await getConnection();
    const origin = publicOrigin(connection, url.origin);

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

    return NextResponse.json({
      ...result,
      continueUrl: `${origin}/agent/chat?contextId=${encodeURIComponent(result.contextId || "")}&message=`,
      hint: "Append your next message to continueUrl and GET again to continue this conversation.",
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
    const body = (await request.json()) as {
      message?: string;
      taskId?: string;
      contextId?: string;
    };
    const result = await handleChat(request, {
      message: String(body.message ?? ""),
      taskId: body.taskId,
      contextId: body.contextId,
    });
    if (result instanceof NextResponse) return result;
    return NextResponse.json(result);
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
