import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createAirsupMcpServer } from "@/lib/mcp-server";
import { authPeerFromRequest } from "@/lib/peers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "content-type, authorization, x-airsup-token, mcp-session-id, accept",
    "Access-Control-Expose-Headers": "mcp-session-id",
  };
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders())) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonRpcUnauthorized(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message:
          "Unauthorized. In ChatGPT New Plugin set Authentication to None and use Server URL with ?token=asp_... (your Airsup token).",
      },
      id: null,
    }),
    { status: 401, headers: { "content-type": "application/json" } }
  );
}

/**
 * Resolve peer from Bearer header OR ?token= query.
 * ChatGPT Developer Mode plugins often use Auth=None + token in the Server URL.
 */
async function resolvePeer(request: Request) {
  try {
    return await authPeerFromRequest(request);
  } catch {
    // try query token
  }
  const url = new URL(request.url);
  const token = (url.searchParams.get("token") || "").trim();
  if (!token) throw new Error("Unauthorized");
  const forged = new Request(request.url, {
    method: request.method,
    headers: {
      ...Object.fromEntries(request.headers.entries()),
      authorization: `Bearer ${token}`,
    },
  });
  return authPeerFromRequest(forged);
}

async function handleMcp(request: Request): Promise<Response> {
  let peer;
  try {
    peer = await resolvePeer(request);
  } catch {
    return withCors(jsonRpcUnauthorized());
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createAirsupMcpServer(peer);
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  return withCors(response);
}

export async function OPTIONS() {
  return withCors(new Response(null, { status: 204 }));
}

export async function GET(request: Request) {
  return handleMcp(request);
}

export async function POST(request: Request) {
  return handleMcp(request);
}

export async function DELETE(request: Request) {
  return handleMcp(request);
}
