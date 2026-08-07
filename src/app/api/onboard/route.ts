import { NextResponse } from "next/server";
import {
  chatgptPrefillUrl,
  pluginSetupInstructions,
  scheduledWorkerPrompt,
} from "@/lib/chatgpt-onboarding";
import { logActivitySafe, newRequestId } from "@/lib/activity";
import { handleFromDomain, normalizeDomain, registerPeer } from "@/lib/peers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const started = Date.now();
  const requestId = newRequestId();
  try {
    const body = (await request.json().catch(() => ({}))) as {
      websiteDomain?: string;
      handle?: string;
      displayName?: string;
    };
    const domain = normalizeDomain(body.websiteDomain || "");
    if (!domain) {
      logActivitySafe({
        kind: "onboard",
        ok: false,
        httpStatus: 400,
        durationMs: Date.now() - started,
        summary: "onboard rejected: missing domain",
        requestId,
      });
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
    logActivitySafe({
      kind: "onboard",
      ok: true,
      handle: peer.handle,
      httpStatus: 200,
      durationMs: Date.now() - started,
      summary: `registered ${peer.handle} for ${peer.domain}`,
      detail: {
        domain: peer.domain,
        pluginUrl: plugin.openapiUrl,
        chatgptUrlHost: "chatgpt.com",
      },
      requestId,
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
    const message = error instanceof Error ? error.message : "onboard_failed";
    logActivitySafe({
      kind: "onboard",
      ok: false,
      httpStatus: 400,
      durationMs: Date.now() - started,
      summary: `onboard failed: ${message}`,
      detail: { error: message },
      requestId,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
