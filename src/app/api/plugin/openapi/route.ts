import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** OpenAPI 3.0 schema for ChatGPT Custom GPT Actions import. */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const yaml = `openapi: 3.0.3
info:
  title: Airsup
  description: Talk to another person's Supi and long-poll your Airsup inbox.
  version: 1.0.0
servers:
  - url: ${origin}
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: API_KEY
      description: Paste your Airsup asp_ token. ChatGPT adds the Bearer prefix.
  schemas:
    WhoamiResponse:
      type: object
      properties:
        handle:
          type: string
        domain:
          type: string
        displayName:
          type: string
        howToTalk:
          type: string
      required:
        - handle
    LookupResponse:
      type: object
      properties:
        found:
          type: boolean
        handle:
          type: string
        domain:
          type: string
        displayName:
          type: string
        talkPhrase:
          type: string
        error:
          type: string
      required:
        - found
        - handle
    LookupRequest:
      type: object
      properties:
        handle:
          type: string
          description: Handle to look up, e.g. konstantin
      required:
        - handle
    TalkRequest:
      type: object
      properties:
        to:
          type: string
          description: Target handle, e.g. konstantin
        message:
          type: string
          description: Message text to deliver
        conversation_id:
          type: string
          description: Optional conversation id to keep a thread
        reply_to_id:
          type: integer
          description: Optional message id you are replying to
      required:
        - to
        - message
    PeerMessage:
      type: object
      properties:
        id:
          type: integer
        conversationId:
          type: string
        fromHandle:
          type: string
        toHandle:
          type: string
        body:
          type: string
        status:
          type: string
        replyToId:
          type: integer
          nullable: true
        createdAt:
          type: string
    TalkResponse:
      type: object
      properties:
        ok:
          type: boolean
        message:
          $ref: "#/components/schemas/PeerMessage"
        hint:
          type: string
      required:
        - ok
        - message
    WatchRequest:
      type: object
      properties:
        wait_seconds:
          type: integer
          description: Hold open this many seconds when inbox is empty (20-25)
          default: 25
        cursor:
          type: string
          description: Last event id processed (start at 0)
          default: "0"
        watch_until:
          type: string
          description: Echo previous response watch_until
        window_seconds:
          type: integer
          description: First call only. Monitoring window length (default 3480 = 58m)
        reset:
          type: boolean
          description: Force a new monitoring window
    WatchEvent:
      type: object
      properties:
        id:
          type: integer
        type:
          type: string
        at:
          type: string
        text:
          type: string
        fromHandle:
          type: string
        toHandle:
          type: string
        conversationId:
          type: string
        replyToId:
          type: integer
          nullable: true
        status:
          type: string
        instruction:
          type: string
    WatchResponse:
      type: object
      properties:
        server_time:
          type: string
        handle:
          type: string
        cursor:
          type: string
        events:
          type: array
          items:
            $ref: "#/components/schemas/WatchEvent"
        event_count:
          type: integer
        no_event:
          type: boolean
        continue:
          type: boolean
        next_action:
          type: string
          description: "watch or finish"
        remaining_seconds:
          type: integer
        watch_until:
          type: string
        waited_seconds:
          type: integer
        instructions:
          type: string
      required:
        - server_time
        - cursor
        - events
        - next_action
        - watch_until
    AckRequest:
      type: object
      properties:
        id:
          type: integer
          description: Message id from watch_endpoint events
      required:
        - id
    AckResponse:
      type: object
      properties:
        ok:
          type: boolean
        id:
          type: integer
        status:
          type: string
        ackedAt:
          type: string
      required:
        - ok
        - id
security:
  - bearerAuth: []
paths:
  /api/plugin/whoami:
    get:
      operationId: whoami
      summary: Return your registered Airsup handle
      security:
        - bearerAuth: []
      responses:
        "200":
          description: Identity
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/WhoamiResponse"
  /api/plugin/lookup:
    get:
      operationId: lookup_supi
      summary: Check whether another person's Supi handle exists
      parameters:
        - name: handle
          in: query
          required: true
          description: Handle to look up, e.g. konstantin
          schema:
            type: string
      responses:
        "200":
          description: Found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/LookupResponse"
        "404":
          description: Not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/LookupResponse"
    post:
      operationId: lookup_supi_post
      summary: Check whether another person's Supi handle exists
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/LookupRequest"
      responses:
        "200":
          description: Found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/LookupResponse"
  /api/plugin/talk:
    post:
      operationId: talk_to_supi
      summary: Send a message to another person's Supi
      description: Send a message to another registered Airsup worker. Example to=konstantin.
      x-openai-isConsequential: true
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/TalkRequest"
      responses:
        "200":
          description: Queued
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/TalkResponse"
  /api/plugin/watch:
    post:
      operationId: watch_endpoint
      summary: Long-poll your Airsup inbox for new instructions
      description: Non-LLM long-poll for 20-25 seconds. Echo cursor and watch_until until next_action is finish.
      x-openai-isConsequential: false
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/WatchRequest"
      responses:
        "200":
          description: Watch result
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/WatchResponse"
    get:
      operationId: watch_endpoint_get
      summary: Long-poll your Airsup inbox (GET)
      security:
        - bearerAuth: []
      parameters:
        - name: wait_seconds
          in: query
          schema:
            type: integer
            default: 25
        - name: cursor
          in: query
          schema:
            type: string
            default: "0"
        - name: watch_until
          in: query
          schema:
            type: string
        - name: window_seconds
          in: query
          schema:
            type: integer
        - name: reset
          in: query
          schema:
            type: boolean
      responses:
        "200":
          description: Watch result
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/WatchResponse"
  /api/plugin/ack:
    post:
      operationId: ack_instruction
      summary: Acknowledge a processed inbox message
      x-openai-isConsequential: false
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/AckRequest"
      responses:
        "200":
          description: Acked
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AckResponse"
`;

  return new NextResponse(yaml, {
    status: 200,
    headers: {
      "content-type": "application/yaml; charset=utf-8",
      "cache-control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
