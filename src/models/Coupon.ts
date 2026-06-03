import mongoose, { Document, Schema } from "mongoose";

export type CouponDiscountType = "fixed" | "percentage";

export interface ICoupon extends Document {
  code: string;
  description: string;
  discountType: CouponDiscountType;
  discountValue: number;
  currency: string;
  active: boolean;
  courseSlugs: string[];
  maxRedemptions?: number;
  redeemedCount: number;
  startsAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema = new Schema<ICoupon>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    discountType: {
      type: String,
      enum: ["fixed", "percentage"],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "GBP",
      uppercase: true,
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    courseSlugs: {
      type: [String],
      default: [],
    },
    maxRedemptions: {
      type: Number,
      min: 1,
    },
    redeemedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    startsAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const Coupon = mongoose.models.Coupon || mongoose.model<ICoupon>("Coupon", CouponSchema);
