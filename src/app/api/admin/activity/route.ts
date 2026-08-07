import { NextResponse } from "next/server";
import { listActivity } from "@/lib/activity";
import { assertAdminPassword } from "@/lib/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertAdminPassword(request.headers.get("x-admin-password"));
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || 120);
    const afterId = Number(url.searchParams.get("after") || 0);
    const events = await listActivity({
      limit: Number.isFinite(limit) ? limit : 120,
      afterId: Number.isFinite(afterId) ? afterId : 0,
    });
    return NextResponse.json({
      ok: true,
      count: events.length,
      events,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    const status =
      message === "Unauthorized" || message.startsWith("Set ADMIN") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
