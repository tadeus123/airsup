import { NextResponse } from "next/server";
import { listToolTraces } from "@/lib/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || "40");
    const traces = await listToolTraces(Number.isFinite(limit) ? limit : 40);
    return NextResponse.json({ traces });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
