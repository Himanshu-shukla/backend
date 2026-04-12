import mongoose, { Document, Schema } from "mongoose";

export interface IContact extends Document {
  fullName: string;
  email: string;
  phone?: string;
  course?: string;
  subject?: string;
  message: string;
  createdAt: Date;
}

const ContactSchema = new Schema<IContact>(
  {
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: false },
    course: { type: String, required: false },
    subject: { type: String, required: false },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

export const Contact = mongoose.models.Contact || mongoose.model<IContact>("Contact", ContactSchema);
