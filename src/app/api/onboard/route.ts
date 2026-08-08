import { NextResponse } from "next/server";
import {
  chatgptPrefillUrl,
  pluginSetupInstructions,
  scheduledTaskDescription,
  scheduledWorkerPrompt,
} from "@/lib/chatgpt-onboarding";
import { logActivitySafe, newRequestId } from "@/lib/activity";
import {
  handleFromDomain,
  normalizeDomain,
  normalizeHandle,
  registerPeer,
} from "@/lib/peers";

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
    const handle = normalizeHandle(
      body.handle || (domain ? handleFromDomain(domain) : "")
    );
    if (!handle) {
      logActivitySafe({
        kind: "onboard",
        ok: false,
        httpStatus: 400,
        durationMs: Date.now() - started,
        summary: "onboard rejected: missing handle",
        requestId,
      });
      return NextResponse.json(
        { error: "Choose a handle (e.g. konstantin)" },
        { status: 400 }
      );
    }
    const { peer, token } = await registerPeer({
      domain,
      handle,
      displayName: body.displayName,
    });
    const origin = new URL(request.url).origin;
    const schedulePrompt = scheduledWorkerPrompt({
      origin,
      handle: peer.handle,
      token,
    });
    const scheduleDescription = scheduledTaskDescription(peer.handle);
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
      summary: peer.domain
        ? `registered ${peer.handle} for ${peer.domain}`
        : `registered handle ${peer.handle}`,
      detail: {
        domain: peer.domain || null,
        mcpUrl: plugin.mcpUrl,
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
      scheduleDescription,
      scheduleName: `Airsup Continuous Worker - ${peer.handle}`,
      pluginUrl: plugin.mcpUrl,
      mcpUrl: plugin.mcpUrl,
      openapiUrl: plugin.openapiUrl,
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
