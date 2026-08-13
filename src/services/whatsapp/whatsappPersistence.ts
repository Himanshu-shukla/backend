import { WhatsappMessage } from "../../models/WhatsappMessage";
import { WhatsappWebhookEvent } from "../../models/WhatsappWebhookEvent";
import {
  NormalizedIncomingMessage,
  NormalizedMessageStatus,
  NormalizedWhatsAppEvent,
} from "./types";

const PROCESSING_LEASE_MS = 5 * 60 * 1000;

export type EventReservation = "created" | "pending" | "processed";

export interface WhatsAppPersistence {
  reserveEvent(event: NormalizedWhatsAppEvent): Promise<EventReservation>;
  claimEvent(eventKey: string): Promise<NormalizedWhatsAppEvent | null>;
  persistIncomingMessage(event: NormalizedIncomingMessage): Promise<void>;
  persistMessageStatus(event: NormalizedMessageStatus): Promise<void>;
  markEventProcessed(eventKey: string, processedAt: Date): Promise<void>;
  markEventFailed(eventKey: string, error: string): Promise<void>;
  findPendingEventKeys(limit: number): Promise<string[]>;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

function statusRank(status: string | undefined): number {
  switch (status) {
    case "accepted":
      return 5;
    case "sent":
      return 10;
    case "delivered":
      return 20;
    case "read":
      return 30;
    case "failed":
      return 40;
    case "deleted":
      return 50;
    default:
      return 0;
  }
}

export class MongooseWhatsAppPersistence implements WhatsAppPersistence {
  async reserveEvent(event: NormalizedWhatsAppEvent): Promise<EventReservation> {
    try {
      await WhatsappWebhookEvent.create({
        eventKey: event.eventKey,
        eventType: event.eventType,
        payload: event,
        processed: false,
        receivedAt: event.receivedAt,
      });
      return "created";
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;

      const existing = await WhatsappWebhookEvent.findOne({ eventKey: event.eventKey })
        .select({ processed: 1 })
        .lean<{ processed: boolean } | null>();
      return existing?.processed ? "processed" : "pending";
    }
  }

  async claimEvent(eventKey: string): Promise<NormalizedWhatsAppEvent | null> {
    const staleBefore = new Date(Date.now() - PROCESSING_LEASE_MS);
    const event = await WhatsappWebhookEvent.findOneAndUpdate(
      {
        eventKey,
        processed: false,
        $or: [
          { processingStartedAt: { $exists: false } },
          { processingStartedAt: null },
          { processingStartedAt: { $lt: staleBefore } },
        ],
      },
      {
        $set: { processingStartedAt: new Date() },
        $unset: { processingError: 1 },
        $inc: { processingAttempts: 1 },
      },
      { new: true }
    ).lean<{ payload: NormalizedWhatsAppEvent } | null>();

    return event ? (event.payload as NormalizedWhatsAppEvent) : null;
  }

  async persistIncomingMessage(event: NormalizedIncomingMessage): Promise<void> {
    if (!event.messageId) return;

    await WhatsappMessage.updateOne(
      { whatsappMessageId: event.messageId },
      {
        $setOnInsert: {
          whatsappMessageId: event.messageId,
          direction: "incoming",
          businessPhoneNumberId: event.whatsappBusinessPhoneNumberId,
          fromPhone: event.senderPhone,
          toPhone: event.businessDisplayPhoneNumber,
          messageType: event.messageType,
          messageText: event.textBody,
          timestamp: event.timestamp,
          rawPayload: event.rawEvent,
        },
      },
      { upsert: true }
    );
  }

  async persistMessageStatus(event: NormalizedMessageStatus): Promise<void> {
    if (!event.whatsappMessageId || !event.status) return;

    const rank = statusRank(event.status);

    await WhatsappMessage.updateOne(
      { whatsappMessageId: event.whatsappMessageId },
      {
        $setOnInsert: {
          whatsappMessageId: event.whatsappMessageId,
          direction: "outgoing",
          toPhone: event.recipientPhone,
          timestamp: event.timestamp,
          rawPayload: event.rawEvent,
        },
      },
      { upsert: true }
    );

    const chronologicalFilter = event.timestamp
      ? {
          $or: [
            { statusTimestamp: { $exists: false } },
            { statusTimestamp: { $lt: event.timestamp } },
            { statusTimestamp: event.timestamp, statusRank: { $lte: rank } },
          ],
        }
      : { statusTimestamp: { $exists: false } };

    const statusUpdate: Record<string, unknown> = {
      status: event.status,
      statusRank: rank,
      lastStatusPayload: event.rawEvent,
    };
    if (event.timestamp) statusUpdate.statusTimestamp = event.timestamp;
    if (event.recipientPhone) statusUpdate.toPhone = event.recipientPhone;
    if (event.conversationId) statusUpdate.conversationId = event.conversationId;
    if (event.pricing) statusUpdate.pricing = event.pricing;
    if (event.errors) statusUpdate.deliveryErrors = event.errors;

    await WhatsappMessage.updateOne(
      { whatsappMessageId: event.whatsappMessageId, ...chronologicalFilter },
      { $set: statusUpdate }
    );
  }

  async markEventProcessed(eventKey: string, processedAt: Date): Promise<void> {
    await WhatsappWebhookEvent.updateOne(
      { eventKey },
      {
        $set: { processed: true, processedAt },
        $unset: { processingStartedAt: 1, processingError: 1 },
      }
    );
  }

  async markEventFailed(eventKey: string, error: string): Promise<void> {
    await WhatsappWebhookEvent.updateOne(
      { eventKey },
      {
        $set: { processed: false, processingError: error },
        $unset: { processingStartedAt: 1 },
      }
    );
  }

  async findPendingEventKeys(limit: number): Promise<string[]> {
    const events = await WhatsappWebhookEvent.find({ processed: false })
      .sort({ receivedAt: 1 })
      .limit(limit)
      .select({ eventKey: 1 })
      .lean();
    return events.map((event) => event.eventKey);
  }
}

export async function initializeWhatsAppPersistence(): Promise<void> {
  await Promise.all([WhatsappMessage.init(), WhatsappWebhookEvent.init()]);
}
