import { NextResponse } from "next/server";
import { assertAdminPassword, listToolTraces } from "@/lib/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertAdminPassword(request.headers.get("x-admin-password"));
    const traces = await listToolTraces(60);
    return NextResponse.json({ traces });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    const status = message === "Unauthorized" || message.startsWith("Set ADMIN") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
