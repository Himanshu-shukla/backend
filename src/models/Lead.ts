import mongoose, { Document, Schema } from "mongoose";

export interface ILead extends Document {
  name: string;
  email: string;
  phone?: string;
  course?: string;
  purpose?: string;
  subject?: string;
  message?: string;
  source: string;
  status: string;
  priority: string;
  folder?: string;
  metaLeadId?: string;
  createdAt: Date;
}

const LeadSchema = new Schema<ILead>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    course: { type: String },
    purpose: { type: String },
    subject: { type: String },
    message: { type: String },
    source: { type: String, required: true, default: "Website" },
    status: { type: String, default: "New" },
    priority: { type: String, default: "Medium" },
    folder: { type: String },
    metaLeadId: { type: String },
  },
  {
    timestamps: true,
  }
);

export const Lead = mongoose.models.Lead || mongoose.model<ILead>("Lead", LeadSchema);
