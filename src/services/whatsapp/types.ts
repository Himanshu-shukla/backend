export type WhatsAppMessageType =
  | "text"
  | "image"
  | "document"
  | "audio"
  | "video"
  | "button"
  | "interactive"
  | "location"
  | "unknown";

export interface NormalizedIncomingMessage {
  eventKey: string;
  eventType: "incoming_message";
  messageId?: string;
  whatsappBusinessPhoneNumberId?: string;
  businessDisplayPhoneNumber?: string;
  senderPhone?: string;
  senderName?: string;
  timestamp?: Date;
  messageType: WhatsAppMessageType;
  originalMessageType?: string;
  textBody?: string;
  mediaId?: string;
  buttonPayload?: string;
  interactivePayload?: Record<string, unknown>;
  locationPayload?: Record<string, unknown>;
  rawEvent: unknown;
  receivedAt: Date;
}

export interface NormalizedMessageStatus {
  eventKey: string;
  eventType: "message_status";
  whatsappMessageId?: string;
  recipientPhone?: string;
  status?: string;
  timestamp?: Date;
  conversationId?: string;
  conversation?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  errors?: unknown[];
  rawEvent: unknown;
  updatedAt: Date;
  receivedAt: Date;
}

export interface NormalizedIgnoredEvent {
  eventKey: string;
  eventType: "ignored";
  reason: string;
  rawEvent: unknown;
  receivedAt: Date;
}

export type NormalizedWhatsAppEvent =
  | NormalizedIncomingMessage
  | NormalizedMessageStatus
  | NormalizedIgnoredEvent;

export interface WebhookReceipt {
  eventKeysToProcess: string[];
  receivedCount: number;
  duplicateCount: number;
  incomingMessageCount: number;
  statusCount: number;
  ignoredCount: number;
}

export interface WhatsAppServiceLogger {
  info(details: Record<string, unknown>, message?: string): void;
  warn(details: Record<string, unknown>, message?: string): void;
  error(details: Record<string, unknown>, message?: string): void;
}
