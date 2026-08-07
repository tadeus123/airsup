import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** OpenAPI 3.1 schema for ChatGPT Custom GPT Actions / plugin import. */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const yaml = `openapi: 3.1.0
info:
  title: Airsup ChatGPT Plugin
  description: >
    Talk to other people's Supi workers and keep an Airsup scheduled run alive
    via long-poll watch. Use talk_to_supi when the user says things like
    "talk to kostis' supi". Use watch_endpoint inside hourly Scheduled Tasks.
  version: 1.0.0
servers:
  - url: ${origin}
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: API Key
security:
  - bearerAuth: []
paths:
  /api/plugin/whoami:
    get:
      operationId: whoami
      summary: Return your registered Airsup handle
      description: Returns the authenticated peer handle and how others should address you.
      responses:
        "200":
          description: Identity
          content:
            application/json:
              schema:
                type: object
                additionalProperties: true
  /api/plugin/lookup:
    get:
      operationId: lookup_supi
      summary: Check whether another person's Supi handle exists
      parameters:
        - name: handle
          in: query
          required: true
          description: Handle to look up, e.g. kostis
          schema:
            type: string
      responses:
        "200":
          description: Found
          content:
            application/json:
              schema:
                type: object
                additionalProperties: true
        "404":
          description: Not found
    post:
      operationId: lookup_supi_post
      summary: Check whether another person's Supi handle exists
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [handle]
              properties:
                handle:
                  type: string
                  description: Handle to look up, e.g. kostis
      responses:
        "200":
          description: Found
          content:
            application/json:
              schema:
                type: object
                additionalProperties: true
  /api/plugin/talk:
    post:
      operationId: talk_to_supi
      summary: Send a message to another person's Supi
      description: >
        Send a message to another registered Airsup worker. Example to=kostis,
        message=Hey are you free Thursday. Their scheduled worker picks it up
        via watch_endpoint.
      x-openai-isConsequential: true
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [to, message]
              properties:
                to:
                  type: string
                  description: Target handle, e.g. kostis
                message:
                  type: string
                  description: Message text to deliver
                conversation_id:
                  type: string
                  description: Optional conversation id to keep a thread
                reply_to_id:
                  type: integer
                  description: Optional message id you are replying to
      responses:
        "200":
          description: Queued
          content:
            application/json:
              schema:
                type: object
                additionalProperties: true
  /api/plugin/watch:
    post:
      operationId: watch_endpoint
      summary: Long-poll your Airsup inbox for new instructions
      description: >
        Non-LLM long-poll. Holds up to wait_seconds (~20-25). Returns events or
        no_event. Echo cursor and watch_until on every subsequent call until
        next_action is finish. Do not stop on empty inbox.
      x-openai-isConsequential: false
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                wait_seconds:
                  type: integer
                  description: Hold open this many seconds when inbox is empty (20-25)
                  default: 25
                cursor:
                  type: string
                  description: Last event id you processed (start at 0)
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
      responses:
        "200":
          description: Watch result
          content:
            application/json:
              schema:
                type: object
                additionalProperties: true
    get:
      operationId: watch_endpoint_get
      summary: Long-poll your Airsup inbox (GET)
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
                type: object
                additionalProperties: true
  /api/plugin/ack:
    post:
      operationId: ack_instruction
      summary: Acknowledge a processed inbox message
      x-openai-isConsequential: false
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [id]
              properties:
                id:
                  type: integer
                  description: Message id from watch_endpoint events
      responses:
        "200":
          description: Acked
          content:
            application/json:
              schema:
                type: object
                additionalProperties: true
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
