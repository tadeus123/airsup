import { NextResponse } from "next/server";
import {
  chatgptPrefillUrl,
  pluginSetupInstructions,
  scheduledWorkerPrompt,
} from "@/lib/chatgpt-onboarding";
import { handleFromDomain, normalizeDomain, registerPeer } from "@/lib/peers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      websiteDomain?: string;
      handle?: string;
      displayName?: string;
    };
    const domain = normalizeDomain(body.websiteDomain || "");
    if (!domain) {
      return NextResponse.json(
        { error: "Website domain is required" },
        { status: 400 }
      );
    }
    const { peer, token } = await registerPeer({
      domain,
      handle: body.handle || handleFromDomain(domain),
      displayName: body.displayName,
    });
    const origin = new URL(request.url).origin;
    const schedulePrompt = scheduledWorkerPrompt({
      origin,
      handle: peer.handle,
      token,
    });
    const chatgptUrl = chatgptPrefillUrl(schedulePrompt);
    const plugin = pluginSetupInstructions({
      origin,
      handle: peer.handle,
      token,
      peer,
    });
    return NextResponse.json({
      ok: true,
      handle: peer.handle,
      domain: peer.domain,
      displayName: peer.displayName,
      token,
      chatgptUrl,
      schedulePrompt,
      pluginUrl: plugin.openapiUrl,
      plugin,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "onboard_failed" },
      { status: 400 }
    );
  }
}
