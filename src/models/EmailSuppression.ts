import mongoose, { Document, Schema } from "mongoose";

export type EmailSuppressionStatus = "unsubscribed" | "bounced" | "complained";

export interface IEmailSuppression extends Document {
  email: string;
  status: EmailSuppressionStatus;
  source: string;
  reason?: string;
  eventType?: string;
  rawEvent?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const EmailSuppressionSchema = new Schema<IEmailSuppression>(
  {
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    status: {
      type: String,
      required: true,
      enum: ["unsubscribed", "bounced", "complained"],
      default: "unsubscribed",
    },
    source: { type: String, required: true, default: "manual" },
    reason: { type: String },
    eventType: { type: String },
    rawEvent: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
  }
);

export const EmailSuppression =
  mongoose.models.EmailSuppression ||
  mongoose.model<IEmailSuppression>("EmailSuppression", EmailSuppressionSchema);
