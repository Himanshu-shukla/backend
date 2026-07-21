import mongoose, { Document, Schema } from "mongoose";

export type PaymentProvider = "razorpay" | "paypal";
export type PaymentStatus = "created" | "authorized" | "captured" | "failed";

export interface IPaymentOrder extends Document {
  provider: PaymentProvider;
  providerOrderId: string;
  providerPaymentId?: string;
  courseSlug: string;
  courseTitle: string;
  amount: number;
  amountMinor: number;
  currency: string;
  couponCode?: string;
  status: PaymentStatus;
  paymentMethod?: string;
  wallet?: string;
  isApplePay: boolean;
  couponRedeemedAt?: Date;
  capturedAt?: Date;
  failedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentOrderSchema = new Schema<IPaymentOrder>(
  {
    provider: {
      type: String,
      enum: ["razorpay", "paypal"],
      required: true,
      index: true,
    },
    providerOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    providerPaymentId: {
      type: String,
      sparse: true,
      unique: true,
      index: true,
    },
    courseSlug: { type: String, required: true, index: true },
    courseTitle: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    amountMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    couponCode: { type: String, uppercase: true, trim: true },
    status: {
      type: String,
      enum: ["created", "authorized", "captured", "failed"],
      default: "created",
      required: true,
      index: true,
    },
    paymentMethod: { type: String },
    wallet: { type: String },
    isApplePay: { type: Boolean, default: false },
    couponRedeemedAt: { type: Date },
    capturedAt: { type: Date },
    failedAt: { type: Date },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

PaymentOrderSchema.index({ provider: 1, providerOrderId: 1 }, { unique: true });

export const PaymentOrder =
  mongoose.models.PaymentOrder || mongoose.model<IPaymentOrder>("PaymentOrder", PaymentOrderSchema);
