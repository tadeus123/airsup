import { NextResponse } from "next/server";
import { getConnection } from "@/lib/connection";
import {
  ensureSiteKnowledge,
  getKnowledgeMeta,
  listStoredPages,
} from "@/lib/site-knowledge";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const { connection } = await getConnection();
    const domain = connection.websiteDomain;
    if (!domain) {
      return NextResponse.json(
        { error: "no_domain", message: "Connect a website domain first." },
        { status: 400 }
      );
    }

    const meta = await getKnowledgeMeta(domain);
    const pages = await listStoredPages(domain);
    return NextResponse.json({
      websiteDomain: domain,
      meta,
      pages: pages.map((p) => ({
        url: p.url,
        path: p.path,
        title: p.title,
        description: p.description,
        chars: p.content.length,
        fetchedAt: p.fetchedAt,
        contentHash: p.contentHash,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "knowledge_failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { connection } = await getConnection();
    const domain = connection.websiteDomain;
    if (!domain) {
      return NextResponse.json(
        { error: "no_domain", message: "Connect a website domain first." },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as { force?: boolean };
    const result = await ensureSiteKnowledge(domain, { force: body.force !== false });
    return NextResponse.json({
      websiteDomain: domain,
      refreshed: result.refreshed,
      meta: result.meta,
      pageCount: result.pages.length,
      paths: result.pages.map((p) => p.path),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "knowledge_refresh_failed" },
      { status: 500 }
    );
  }
}
