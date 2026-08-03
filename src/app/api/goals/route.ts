import { NextResponse } from "next/server";
import {
  getConnection,
  saveOwnerGoals,
  toPublic,
} from "@/lib/connection";
import { PODCAST_GOALS_EXAMPLE } from "@/lib/owner-goals";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { connection, storage } = await getConnection();
    return NextResponse.json({
      ...toPublic(connection, storage),
      example: PODCAST_GOALS_EXAMPLE,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "goals_failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      ownerGoals?: string;
    };
    const saved = await saveOwnerGoals(String(body.ownerGoals ?? ""));
    return NextResponse.json({
      ...toPublic(saved.connection, saved.storage),
      example: PODCAST_GOALS_EXAMPLE,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "goals_save_failed";
    const status = /Connect your domain/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
