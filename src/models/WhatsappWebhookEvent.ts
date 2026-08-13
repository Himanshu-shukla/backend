import mongoose, { Document, Schema } from "mongoose";

export type WhatsappWebhookEventType = "incoming_message" | "message_status" | "ignored";

export interface IWhatsappWebhookEvent extends Document {
  eventKey: string;
  eventType: WhatsappWebhookEventType;
  payload: unknown;
  processed: boolean;
  processingAttempts: number;
  processingStartedAt?: Date;
  processingError?: string;
  receivedAt: Date;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WhatsappWebhookEventSchema = new Schema<IWhatsappWebhookEvent>(
  {
    eventKey: { type: String, required: true, unique: true, index: true, maxlength: 512 },
    eventType: {
      type: String,
      enum: ["incoming_message", "message_status", "ignored"],
      required: true,
      index: true,
    },
    payload: { type: Schema.Types.Mixed, required: true },
    processed: { type: Boolean, required: true, default: false, index: true },
    processingAttempts: { type: Number, required: true, default: 0 },
    processingStartedAt: { type: Date },
    processingError: { type: String },
    receivedAt: { type: Date, required: true, default: Date.now, index: true },
    processedAt: { type: Date },
  },
  {
    collection: "whatsapp_webhook_events",
    timestamps: true,
    versionKey: false,
  }
);

WhatsappWebhookEventSchema.index({ processed: 1, receivedAt: 1 });

export const WhatsappWebhookEvent =
  mongoose.models.WhatsappWebhookEvent ||
  mongoose.model<IWhatsappWebhookEvent>("WhatsappWebhookEvent", WhatsappWebhookEventSchema);
