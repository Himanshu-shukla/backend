import { parseWhatsAppWebhook } from "./webhookParser";
import {
  NormalizedWhatsAppEvent,
  WebhookReceipt,
  WhatsAppServiceLogger,
} from "./types";
import { MongooseWhatsAppPersistence, WhatsAppPersistence } from "./whatsappPersistence";

const STARTUP_RECOVERY_LIMIT = 100;

export interface WhatsAppWebhookServiceContract {
  acceptWebhook(payload: unknown, payloadHash: string, receivedAt?: Date): Promise<WebhookReceipt>;
  processEventKeysInBackground(eventKeys: string[], logger: WhatsAppServiceLogger): void;
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown webhook processing error";
  return message.slice(0, 1000);
}

function errorDetails(error: unknown): Record<string, unknown> {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: "UnknownError", message: "Unknown webhook processing error" };
}

export class WhatsAppService implements WhatsAppWebhookServiceContract {
  constructor(private readonly persistence: WhatsAppPersistence = new MongooseWhatsAppPersistence()) {}

  async acceptWebhook(payload: unknown, payloadHash: string, receivedAt = new Date()): Promise<WebhookReceipt> {
    const events = parseWhatsAppWebhook(payload, { receivedAt, payloadHash });
    const eventKeysToProcess = new Set<string>();
    let duplicateCount = 0;

    for (const event of events) {
      const reservation = await this.persistence.reserveEvent(event);
      if (reservation === "created" || reservation === "pending") {
        eventKeysToProcess.add(event.eventKey);
      }
      if (reservation !== "created") duplicateCount += 1;
    }

    return {
      eventKeysToProcess: [...eventKeysToProcess],
      receivedCount: events.length,
      duplicateCount,
      incomingMessageCount: events.filter((event) => event.eventType === "incoming_message").length,
      statusCount: events.filter((event) => event.eventType === "message_status").length,
      ignoredCount: events.filter((event) => event.eventType === "ignored").length,
    };
  }

  async processEventKeys(eventKeys: string[], logger: WhatsAppServiceLogger): Promise<void> {
    for (const eventKey of eventKeys) {
      let event: NormalizedWhatsAppEvent | null = null;

      try {
        event = await this.persistence.claimEvent(eventKey);
        if (!event) continue;

        if (event.eventType === "incoming_message") {
          await this.persistence.persistIncomingMessage(event);
          logger.info(
            {
              event: "incoming_whatsapp_message",
              eventKey,
              messageId: event.messageId,
              messageType: event.messageType,
              hasText: Boolean(event.textBody),
              hasMedia: Boolean(event.mediaId),
            },
            "Incoming WhatsApp message processed"
          );
        } else if (event.eventType === "message_status") {
          await this.persistence.persistMessageStatus(event);
          logger.info(
            {
              event: "whatsapp_message_status_change",
              eventKey,
              messageId: event.whatsappMessageId,
              status: event.status,
              hasErrors: Boolean(event.errors?.length),
            },
            "WhatsApp message status processed"
          );
        } else {
          logger.warn(
            { event: "whatsapp_webhook_event_ignored", eventKey, reason: event.reason },
            "WhatsApp webhook contained no supported message or status events"
          );
        }

        await this.persistence.markEventProcessed(eventKey, new Date());
      } catch (error) {
        try {
          await this.persistence.markEventFailed(eventKey, safeErrorMessage(error));
        } catch (markError) {
          logger.error(
            { event: "whatsapp_webhook_failure_recording_error", eventKey, error: errorDetails(markError) },
            "Failed to record WhatsApp webhook processing failure"
          );
        }

        logger.error(
          {
            event: "whatsapp_webhook_processing_error",
            eventKey,
            eventType: event?.eventType,
            error: errorDetails(error),
          },
          "WhatsApp webhook processing failed"
        );
      }
    }
  }

  processEventKeysInBackground(eventKeys: string[], logger: WhatsAppServiceLogger): void {
    if (!eventKeys.length) return;

    setImmediate(() => {
      void this.processEventKeys(eventKeys, logger);
    });
  }

  processPendingEventsInBackground(logger: WhatsAppServiceLogger): void {
    setImmediate(() => {
      void this.persistence
        .findPendingEventKeys(STARTUP_RECOVERY_LIMIT)
        .then((eventKeys) => this.processEventKeys(eventKeys, logger))
        .catch((error) => {
          logger.error(
            { event: "whatsapp_webhook_recovery_error", error: errorDetails(error) },
            "Failed to recover pending WhatsApp webhook events"
          );
        });
    });
  }
}
