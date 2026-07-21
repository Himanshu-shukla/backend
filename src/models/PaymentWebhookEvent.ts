import mongoose, { Document, Schema } from "mongoose";

export interface IPaymentWebhookEvent extends Document {
  provider: "razorpay";
  eventId: string;
  eventType: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentWebhookEventSchema = new Schema<IPaymentWebhookEvent>(
  {
    provider: { type: String, enum: ["razorpay"], required: true },
    eventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const PaymentWebhookEvent =
  mongoose.models.PaymentWebhookEvent ||
  mongoose.model<IPaymentWebhookEvent>("PaymentWebhookEvent", PaymentWebhookEventSchema);
