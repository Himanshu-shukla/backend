import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import Fastify, { FastifyInstance } from "fastify";
import { whatsappWebhookRoutes } from "../routes/whatsappWebhook";
import { parseWhatsAppWebhook } from "../services/whatsapp/webhookParser";
import {
  NormalizedIncomingMessage,
  NormalizedMessageStatus,
  NormalizedWhatsAppEvent,
  WebhookReceipt,
  WhatsAppServiceLogger,
} from "../services/whatsapp/types";
import {
  EventReservation,
  WhatsAppPersistence,
} from "../services/whatsapp/whatsappPersistence";
import {
  WhatsAppService,
  WhatsAppWebhookServiceContract,
} from "../services/whatsapp/whatsappService";

const VERIFY_TOKEN = "local-verification-token";
const APP_SECRET = "local-app-secret";

process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;
process.env.META_APP_SECRET = APP_SECRET;

function signedPayload(rawBody: string): string {
  return `sha256=${crypto.createHmac("sha256", APP_SECRET).update(rawBody).digest("hex")}`;
}

function webhookPayload(value: Record<string, unknown>): Record<string, unknown> {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-1",
        changes: [{ field: "messages", value }],
      },
    ],
  };
}

class RouteTestService implements WhatsAppWebhookServiceContract {
  acceptedPayloads: unknown[] = [];
  backgroundKeys: string[][] = [];

  async acceptWebhook(payload: unknown): Promise<WebhookReceipt> {
    this.acceptedPayloads.push(payload);
    return {
      eventKeysToProcess: ["event-1"],
      receivedCount: 1,
      duplicateCount: 0,
      incomingMessageCount: 1,
      statusCount: 0,
      ignoredCount: 0,
    };
  }

  processEventKeysInBackground(eventKeys: string[]): void {
    this.backgroundKeys.push(eventKeys);
  }
}

async function routeServer(service = new RouteTestService()): Promise<{
  server: FastifyInstance;
  service: RouteTestService;
}> {
  const server = Fastify({ logger: false });
  await server.register(whatsappWebhookRoutes, { service });
  await server.ready();
  return { server, service };
}

test("GET verification returns only the challenge for the correct token", async () => {
  const { server } = await routeServer();
  try {
    const response = await server.inject({
      method: "GET",
      url: `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=challenge-123`,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, "challenge-123");
    assert.match(String(response.headers["content-type"] ?? ""), /^text\/plain/);
  } finally {
    await server.close();
  }
});

test("GET verification rejects an incorrect token without exposing the configured token", async () => {
  const { server } = await routeServer();
  try {
    const response = await server.inject({
      method: "GET",
      url: "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-123",
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.includes(VERIFY_TOKEN), false);
  } finally {
    await server.close();
  }
});

test("POST accepts a signature computed over the exact raw body", async () => {
  const { server, service } = await routeServer();
  const rawBody = JSON.stringify(webhookPayload({ messages: [{ id: "wamid.1", type: "text" }] }));

  try {
    const response = await server.inject({
      method: "POST",
      url: "/webhooks/whatsapp",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signedPayload(rawBody),
      },
      payload: rawBody,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(service.acceptedPayloads.length, 1);
    assert.deepEqual(service.backgroundKeys, [["event-1"]]);
  } finally {
    await server.close();
  }
});

test("POST rejects an invalid signature before processing", async () => {
  const { server, service } = await routeServer();
  const rawBody = JSON.stringify(webhookPayload({ messages: [] }));

  try {
    const response = await server.inject({
      method: "POST",
      url: "/webhooks/whatsapp",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": `sha256=${"0".repeat(64)}`,
      },
      payload: rawBody,
    });

    assert.equal(response.statusCode, 401);
    assert.equal(service.acceptedPayloads.length, 0);
  } finally {
    await server.close();
  }
});

test("POST handles a missing signature safely", async () => {
  const { server, service } = await routeServer();

  try {
    const response = await server.inject({
      method: "POST",
      url: "/webhooks/whatsapp",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify(webhookPayload({ messages: [] })),
    });

    assert.equal(response.statusCode, 401);
    assert.equal(service.acceptedPayloads.length, 0);
  } finally {
    await server.close();
  }
});

test("POST rejects malformed JSON without invoking webhook processing", async () => {
  const { server, service } = await routeServer();
  const rawBody = "{not-json";

  try {
    const response = await server.inject({
      method: "POST",
      url: "/webhooks/whatsapp",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signedPayload(rawBody),
      },
      payload: rawBody,
    });

    assert.equal(response.statusCode, 400);
    assert.equal(service.acceptedPayloads.length, 0);
  } finally {
    await server.close();
  }
});

test("parser normalizes a text message", () => {
  const payload = webhookPayload({
    metadata: { display_phone_number: "15550001111", phone_number_id: "phone-number-id" },
    contacts: [{ wa_id: "447700900123", profile: { name: "Learner" } }],
    messages: [
      {
        id: "wamid.text-1",
        from: "447700900123",
        timestamp: "1710000000",
        type: "text",
        text: { body: "Hello" },
      },
    ],
  });

  const [event] = parseWhatsAppWebhook(payload, { receivedAt: new Date("2026-08-13T12:00:00Z") });
  assert.equal(event.eventType, "incoming_message");
  if (event.eventType !== "incoming_message") assert.fail("Expected an incoming message");
  assert.equal(event.messageId, "wamid.text-1");
  assert.equal(event.senderName, "Learner");
  assert.equal(event.messageType, "text");
  assert.equal(event.textBody, "Hello");
  assert.equal(event.whatsappBusinessPhoneNumberId, "phone-number-id");
  assert.equal(event.timestamp?.toISOString(), "2024-03-09T16:00:00.000Z");
});

test("parser normalizes a status event with conversation, pricing, and errors", () => {
  const payload = webhookPayload({
    statuses: [
      {
        id: "wamid.outbound-1",
        recipient_id: "447700900123",
        status: "failed",
        timestamp: "1710000001",
        conversation: { id: "conversation-1", origin: { type: "marketing" } },
        pricing: { billable: true, pricing_model: "CBP", category: "marketing" },
        errors: [{ code: 131000, title: "Example failure" }],
      },
    ],
  });

  const [event] = parseWhatsAppWebhook(payload);
  assert.equal(event.eventType, "message_status");
  if (event.eventType !== "message_status") assert.fail("Expected a message status");
  assert.equal(event.whatsappMessageId, "wamid.outbound-1");
  assert.equal(event.status, "failed");
  assert.equal(event.conversationId, "conversation-1");
  assert.equal(event.pricing?.category, "marketing");
  assert.equal(event.errors?.length, 1);
});

test("parser tolerates missing optional message fields", () => {
  const payload = webhookPayload({ messages: [{ id: "wamid.sparse", type: "text" }] });
  const [event] = parseWhatsAppWebhook(payload);

  assert.equal(event.eventType, "incoming_message");
  if (event.eventType !== "incoming_message") assert.fail("Expected an incoming message");
  assert.equal(event.messageId, "wamid.sparse");
  assert.equal(event.textBody, undefined);
  assert.equal(event.senderPhone, undefined);
});

test("parser maps unsupported message types to unknown without crashing", () => {
  const payload = webhookPayload({
    messages: [{ id: "wamid.future", type: "future_message_type", future_message_type: { value: 1 } }],
  });
  const [event] = parseWhatsAppWebhook(payload);

  assert.equal(event.eventType, "incoming_message");
  if (event.eventType !== "incoming_message") assert.fail("Expected an incoming message");
  assert.equal(event.messageType, "unknown");
  assert.equal(event.originalMessageType, "future_message_type");
});

test("parser converts malformed payloads into safe ignored events", () => {
  const [event] = parseWhatsAppWebhook(null, { payloadHash: "payload-hash" });
  assert.equal(event.eventType, "ignored");
  assert.equal(event.eventKey, "whatsapp-ignored:payload-hash");
  if (event.eventType !== "ignored") assert.fail("Expected an ignored event");
  assert.equal(event.reason, "malformed_payload");
});

class InMemoryPersistence implements WhatsAppPersistence {
  private readonly events = new Map<
    string,
    { event: NormalizedWhatsAppEvent; claimed: boolean; processed: boolean }
  >();
  incomingWrites = 0;
  statusWrites = 0;

  async reserveEvent(event: NormalizedWhatsAppEvent): Promise<EventReservation> {
    const existing = this.events.get(event.eventKey);
    if (existing) return existing.processed ? "processed" : "pending";
    this.events.set(event.eventKey, { event, claimed: false, processed: false });
    return "created";
  }

  async claimEvent(eventKey: string): Promise<NormalizedWhatsAppEvent | null> {
    const stored = this.events.get(eventKey);
    if (!stored || stored.claimed || stored.processed) return null;
    stored.claimed = true;
    return stored.event;
  }

  async persistIncomingMessage(_event: NormalizedIncomingMessage): Promise<void> {
    this.incomingWrites += 1;
  }

  async persistMessageStatus(_event: NormalizedMessageStatus): Promise<void> {
    this.statusWrites += 1;
  }

  async markEventProcessed(eventKey: string): Promise<void> {
    const stored = this.events.get(eventKey);
    if (stored) stored.processed = true;
  }

  async markEventFailed(eventKey: string): Promise<void> {
    const stored = this.events.get(eventKey);
    if (stored) stored.claimed = false;
  }

  async findPendingEventKeys(limit: number): Promise<string[]> {
    return [...this.events.entries()]
      .filter(([, event]) => !event.processed)
      .slice(0, limit)
      .map(([eventKey]) => eventKey);
  }
}

const silentLogger: WhatsAppServiceLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

test("duplicate webhooks do not cause duplicate message processing", async () => {
  const persistence = new InMemoryPersistence();
  const service = new WhatsAppService(persistence);
  const payload = webhookPayload({
    messages: [{ id: "wamid.duplicate", from: "447700900123", type: "text", text: { body: "Hello" } }],
  });

  const first = await service.acceptWebhook(payload, "same-payload-hash");
  const duplicate = await service.acceptWebhook(payload, "same-payload-hash");
  await service.processEventKeys(
    [...first.eventKeysToProcess, ...duplicate.eventKeysToProcess],
    silentLogger
  );

  assert.equal(first.duplicateCount, 0);
  assert.equal(duplicate.duplicateCount, 1);
  assert.equal(persistence.incomingWrites, 1);
});
