import { Schema, model, Document } from "mongoose";

export interface ICourse extends Document {
  slug: string;
  topBadge: string;
  bottomLeftBadge: string;
  isPopular: boolean;
  title: string;
  desc: string;
  price: number;
  currency: string;
  duration: string;
  projects: string;
  gradient: string;
  iconName: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const CourseSchema = new Schema<ICourse>(
  {
    slug: {
      type: String,
      required: [true, "Slug is required"],
      unique: true,
      trim: true,
      lowercase: true,
    },
    topBadge: {
      type: String,
      required: [true, "Top badge is required"],
      trim: true,
    },
    bottomLeftBadge: {
      type: String,
      required: [true, "Bottom left badge is required"],
      trim: true,
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    desc: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },
    currency: {
      type: String,
      required: [true, "Currency is required"],
      default: "GBP",
      uppercase: true,
      trim: true,
    },
    duration: {
      type: String,
      required: [true, "Duration is required"],
      trim: true,
    },
    projects: {
      type: String,
      required: [true, "Projects field is required"],
      trim: true,
    },
    gradient: {
      type: String,
      required: [true, "Gradient is required"],
      trim: true,
    },
    // Name of Lucide icon to render on the frontend (e.g. "BarChart", "Code", "Layers")
    iconName: {
      type: String,
      required: [true, "Icon name is required"],
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Index for fast sorted queries
CourseSchema.index({ order: 1 });

export const Course = model<ICourse>("Course", CourseSchema);
