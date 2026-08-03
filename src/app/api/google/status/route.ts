import { NextResponse } from "next/server";
import { getConnection, toPublic } from "@/lib/connection";
import { isGoogleOAuthConfigured } from "@/lib/google-oauth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { connection, storage } = await getConnection();
    return NextResponse.json({
      ...toPublic(connection, storage),
      oauthConfigured: isGoogleOAuthConfigured(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "status_failed" },
      { status: 500 }
    );
  }
}
