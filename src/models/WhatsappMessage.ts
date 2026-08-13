import mongoose, { Document, Schema } from "mongoose";

export type WhatsappMessageDirection = "incoming" | "outgoing";

export interface IWhatsappMessage extends Document {
  whatsappMessageId: string;
  direction: WhatsappMessageDirection;
  businessPhoneNumberId?: string;
  fromPhone?: string;
  toPhone?: string;
  messageType?: string;
  messageText?: string;
  status?: string;
  statusTimestamp?: Date;
  statusRank?: number;
  templateName?: string;
  conversationId?: string;
  pricing?: Record<string, unknown>;
  deliveryErrors?: unknown[];
  timestamp?: Date;
  rawPayload?: unknown;
  lastStatusPayload?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const WhatsappMessageSchema = new Schema<IWhatsappMessage>(
  {
    whatsappMessageId: { type: String, required: true, unique: true, index: true },
    direction: { type: String, enum: ["incoming", "outgoing"], required: true, index: true },
    businessPhoneNumberId: { type: String, index: true },
    fromPhone: { type: String, index: true },
    toPhone: { type: String, index: true },
    messageType: { type: String },
    messageText: { type: String },
    status: { type: String, index: true },
    statusTimestamp: { type: Date },
    statusRank: { type: Number },
    templateName: { type: String },
    conversationId: { type: String, index: true },
    pricing: { type: Schema.Types.Mixed },
    deliveryErrors: { type: [Schema.Types.Mixed], default: undefined },
    timestamp: { type: Date, index: true },
    rawPayload: { type: Schema.Types.Mixed },
    lastStatusPayload: { type: Schema.Types.Mixed },
  },
  {
    collection: "whatsapp_messages",
    timestamps: true,
    versionKey: false,
  }
);

WhatsappMessageSchema.index({ direction: 1, timestamp: -1 });

export const WhatsappMessage =
  mongoose.models.WhatsappMessage ||
  mongoose.model<IWhatsappMessage>("WhatsappMessage", WhatsappMessageSchema);
