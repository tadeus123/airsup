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
    return NextResponse.json(toPublic(connection, storage));
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
      agentWebhookUrl: body.agentWebhookUrl,
      agentSecret: secret,
    });
    const origin = new URL(request.url).origin;
    const domain = saved.connection.websiteDomain;
    return NextResponse.json({
      ...toPublic(saved.connection, saved.storage),
      prompt: websiteCursorPrompt(domain, origin),
      chatgptPrompt: chatgptPrompt(domain),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    const status = message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
