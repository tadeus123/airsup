import { NextResponse } from "next/server";
import { getConnection } from "@/lib/connection";
import { exchangeCodeForTokens, verifyOAuthState } from "@/lib/google-oauth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const setupPath = `${origin}/domain/setup`;

  try {
    const error = url.searchParams.get("error");
    if (error) {
      return NextResponse.redirect(
        `${setupPath}?error=${encodeURIComponent(error)}`,
        302
      );
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      return NextResponse.redirect(
        `${setupPath}?error=${encodeURIComponent("Missing OAuth code")}`,
        302
      );
    }

    const { connection } = await getConnection();
    const verified = verifyOAuthState(state, connection.websiteDomain);
    if (!connection.connected || verified.websiteDomain !== connection.websiteDomain) {
      return NextResponse.redirect(
        `${setupPath}?error=${encodeURIComponent("Domain is not connected")}`,
        302
      );
    }

    await exchangeCodeForTokens({
      code,
      requestOrigin: origin,
      service: verified.service,
    });

    const flash =
      verified.service === "gmail" ? "gmail=connected" : "calendar=connected";
    return NextResponse.redirect(`${setupPath}?${flash}`, 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : "oauth_failed";
    return NextResponse.redirect(
      `${setupPath}?error=${encodeURIComponent(message)}`,
      302
    );
  }
}
