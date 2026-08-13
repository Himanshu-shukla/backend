import crypto from "crypto";
import {
  NormalizedIgnoredEvent,
  NormalizedIncomingMessage,
  NormalizedMessageStatus,
  NormalizedWhatsAppEvent,
  WhatsAppMessageType,
} from "./types";

type UnknownRecord = Record<string, unknown>;

const SUPPORTED_MESSAGE_TYPES = new Set<WhatsAppMessageType>([
  "text",
  "image",
  "document",
  "audio",
  "video",
  "button",
  "interactive",
  "location",
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function recordValue(value: unknown): UnknownRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function parseMetaTimestamp(value: unknown): Date | undefined {
  const seconds = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;

  const timestamp = new Date(seconds * 1000);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

function hashValue(value: unknown): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? String(value);
  } catch {
    serialized = String(value);
  }

  return crypto.createHash("sha256").update(serialized).digest("hex");
}

function findContact(contacts: UnknownRecord[], senderPhone: string | undefined): UnknownRecord | undefined {
  if (!contacts.length) return undefined;
  if (!senderPhone) return contacts[0];
  return contacts.find((contact) => stringValue(contact.wa_id) === senderPhone) ?? contacts[0];
}

function contactName(contact: UnknownRecord | undefined): string | undefined {
  return stringValue(recordValue(contact?.profile)?.name);
}

function normalizeMessageType(type: string | undefined): WhatsAppMessageType {
  return type && SUPPORTED_MESSAGE_TYPES.has(type as WhatsAppMessageType)
    ? (type as WhatsAppMessageType)
    : "unknown";
}

function normalizeIncomingMessage(
  message: UnknownRecord,
  context: {
    object?: string;
    entryId?: string;
    field?: string;
    metadata?: UnknownRecord;
    contacts: UnknownRecord[];
    receivedAt: Date;
  }
): NormalizedIncomingMessage {
  const messageId = stringValue(message.id);
  const senderPhone = stringValue(message.from);
  const originalMessageType = stringValue(message.type);
  const messageType = normalizeMessageType(originalMessageType);
  const contact = findContact(context.contacts, senderPhone);
  const text = recordValue(message.text);
  const media = recordValue(message[messageType]);
  const button = recordValue(message.button);
  const interactive = recordValue(message.interactive);
  const location = recordValue(message.location);

  let textBody = stringValue(text?.body);
  if (!textBody && ["image", "document", "audio", "video"].includes(messageType)) {
    textBody = stringValue(media?.caption);
  }
  if (!textBody && messageType === "button") {
    textBody = stringValue(button?.text);
  }

  const rawEvent = {
    object: context.object,
    entryId: context.entryId,
    field: context.field,
    metadata: context.metadata,
    contact,
    message,
  };

  return {
    eventKey: messageId ? `whatsapp-message:${messageId}` : `whatsapp-message:${hashValue(rawEvent)}`,
    eventType: "incoming_message",
    messageId,
    whatsappBusinessPhoneNumberId: stringValue(context.metadata?.phone_number_id),
    businessDisplayPhoneNumber: stringValue(context.metadata?.display_phone_number),
    senderPhone,
    senderName: contactName(contact),
    timestamp: parseMetaTimestamp(message.timestamp),
    messageType,
    originalMessageType: messageType === "unknown" ? originalMessageType : undefined,
    textBody,
    mediaId: ["image", "document", "audio", "video"].includes(messageType)
      ? stringValue(media?.id)
      : undefined,
    buttonPayload: messageType === "button" ? stringValue(button?.payload) : undefined,
    interactivePayload: messageType === "interactive" ? interactive : undefined,
    locationPayload: messageType === "location" ? location : undefined,
    rawEvent,
    receivedAt: context.receivedAt,
  };
}

function normalizeStatus(
  status: UnknownRecord,
  context: {
    object?: string;
    entryId?: string;
    field?: string;
    metadata?: UnknownRecord;
    receivedAt: Date;
  }
): NormalizedMessageStatus {
  const whatsappMessageId = stringValue(status.id);
  const statusName = stringValue(status.status);
  const conversation = recordValue(status.conversation);
  const pricing = recordValue(status.pricing);
  const errors = Array.isArray(status.errors) ? status.errors : undefined;
  const rawEvent = {
    object: context.object,
    entryId: context.entryId,
    field: context.field,
    metadata: context.metadata,
    status,
  };
  const fallbackKey = hashValue(rawEvent);

  return {
    eventKey:
      whatsappMessageId && statusName
        ? `whatsapp-status:${whatsappMessageId}:${statusName}`
        : `whatsapp-status:${fallbackKey}`,
    eventType: "message_status",
    whatsappMessageId,
    recipientPhone: stringValue(status.recipient_id),
    status: statusName,
    timestamp: parseMetaTimestamp(status.timestamp),
    conversationId: stringValue(conversation?.id),
    conversation,
    pricing,
    errors,
    rawEvent,
    updatedAt: context.receivedAt,
    receivedAt: context.receivedAt,
  };
}

function ignoredEvent(payload: unknown, receivedAt: Date, payloadHash?: string): NormalizedIgnoredEvent {
  return {
    eventKey: `whatsapp-ignored:${payloadHash ?? hashValue(payload)}`,
    eventType: "ignored",
    reason: isRecord(payload) ? "no_supported_events" : "malformed_payload",
    rawEvent: payload,
    receivedAt,
  };
}

export function parseWhatsAppWebhook(
  payload: unknown,
  options: { receivedAt?: Date; payloadHash?: string } = {}
): NormalizedWhatsAppEvent[] {
  const receivedAt = options.receivedAt ?? new Date();
  if (!isRecord(payload)) return [ignoredEvent(payload, receivedAt, options.payloadHash)];

  const normalized: NormalizedWhatsAppEvent[] = [];
  const object = stringValue(payload.object);

  for (const entry of records(payload.entry)) {
    const entryId = stringValue(entry.id);

    for (const change of records(entry.changes)) {
      const field = stringValue(change.field);
      const value = recordValue(change.value);
      if (!value) continue;

      const metadata = recordValue(value.metadata);
      const contacts = records(value.contacts);
      const context = { object, entryId, field, metadata, contacts, receivedAt };

      for (const message of records(value.messages)) {
        normalized.push(normalizeIncomingMessage(message, context));
      }

      for (const status of records(value.statuses)) {
        normalized.push(normalizeStatus(status, context));
      }
    }
  }

  return normalized.length ? normalized : [ignoredEvent(payload, receivedAt, options.payloadHash)];
}
