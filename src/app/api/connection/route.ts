import { NextResponse } from "next/server";
import {
  assertSetupPassword,
  getConnection,
  saveConnection,
  toPublic,
} from "@/lib/connection";
import { chatgptPrompt, websiteCursorPrompt } from "@/lib/prompts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertSetupPassword(request.headers.get("x-setup-password"));
    const { connection, storage } = await getConnection();
    const origin = new URL(request.url).origin;
    return NextResponse.json({
      ...toPublic(connection, storage),
      websiteCursorPrompt: websiteCursorPrompt(connection.websiteDomain, origin),
      chatgptPrompt: chatgptPrompt(connection.websiteDomain),
      vercelEnv: [
        `WEBSITE_DOMAIN=${connection.websiteDomain || "tademehl.com"}`,
        `AGENT_WEBHOOK_URL=${connection.agentWebhookUrl || ""}`,
        `AGENT_SECRET=${connection.agentSecret ? "••••••••" : ""}`,
      ].join("\n"),
      tip:
        storage === "redis"
          ? "Saved in Upstash Redis — live immediately."
          : storage === "env"
            ? "Loaded from Vercel environment variables."
            : "No durable store yet. Add Upstash Redis, or paste env vars into Vercel and redeploy.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    assertSetupPassword(request.headers.get("x-setup-password"));
    const body = (await request.json()) as {
      websiteDomain?: string;
      agentWebhookUrl?: string;
      agentSecret?: string;
    };
    const existing = await getConnection();
    const secret = (body.agentSecret || existing.connection.agentSecret || "").trim();
    const saved = await saveConnection({
      websiteDomain: body.websiteDomain || "",
      agentWebhookUrl: body.agentWebhookUrl || "",
      agentSecret: secret,
    });
    const origin = new URL(request.url).origin;
    return NextResponse.json({
      ...toPublic(saved.connection, saved.storage),
      websiteCursorPrompt: websiteCursorPrompt(saved.connection.websiteDomain, origin),
      chatgptPrompt: chatgptPrompt(saved.connection.websiteDomain),
      vercelEnv: [
        `WEBSITE_DOMAIN=${saved.connection.websiteDomain}`,
        `AGENT_WEBHOOK_URL=${saved.connection.agentWebhookUrl}`,
        `AGENT_SECRET=${saved.connection.agentSecret}`,
      ].join("\n"),
      tip:
        saved.storage === "redis"
          ? "Connected and saved online. Next: run the Website Cursor prompt on your site."
          : "Form accepted. For Vercel durability without Redis: paste vercelEnv into Project Settings → Environment Variables, then Redeploy. Or add free Upstash Redis.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    const status = message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
