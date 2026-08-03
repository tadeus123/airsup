import { NextResponse } from "next/server";
import { getConnection } from "@/lib/connection";
import { ensureSiteKnowledge } from "@/lib/site-knowledge";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vercel Cron: keep Supi's website knowledge fresh so site edits
 * are visible within minutes without waiting for the next chat.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET || process.env.AIRSUP_DB_TOKEN || "";
  const auth = request.headers.get("authorization") || "";
  const url = new URL(request.url);
  const qs = url.searchParams.get("secret") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (secret && bearer !== secret && qs !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { connection } = await getConnection();
    if (!connection.websiteDomain) {
      return NextResponse.json({ ok: true, skipped: true, reason: "no_domain" });
    }

    const result = await ensureSiteKnowledge(connection.websiteDomain, { force: true });
    return NextResponse.json({
      ok: true,
      websiteDomain: connection.websiteDomain,
      refreshed: result.refreshed,
      meta: result.meta,
      pageCount: result.pages.length,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "cron_failed" },
      { status: 500 }
    );
  }
}
