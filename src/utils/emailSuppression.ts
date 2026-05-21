import crypto from "crypto";
import { EmailSuppression, EmailSuppressionStatus } from "../models/EmailSuppression";

const FALLBACK_SECRET = "brit-institute-local-unsubscribe-secret";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getUnsubscribeSecret() {
  return process.env.UNSUBSCRIBE_SECRET || process.env.AWS_SECRET_ACCESS_KEY || FALLBACK_SECRET;
}

export function createUnsubscribeToken(email: string) {
  return crypto
    .createHmac("sha256", getUnsubscribeSecret())
    .update(normalizeEmail(email))
    .digest("hex");
}

export function verifyUnsubscribeToken(email: string, token: string) {
  const expected = createUnsubscribeToken(email);
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(token, "hex");

  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export function getPublicBaseUrl() {
  return (
    process.env.PUBLIC_API_URL ||
    process.env.BACKEND_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:4000"
  ).replace(/\/+$/, "");
}

export function buildUnsubscribeUrl(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const params = new URLSearchParams({
    email: normalizedEmail,
    token: createUnsubscribeToken(normalizedEmail),
  });

  return `${getPublicBaseUrl()}/unsubscribe?${params.toString()}`;
}

export async function suppressEmail({
  email,
  status,
  source,
  reason,
  eventType,
  rawEvent,
}: {
  email: string;
  status: EmailSuppressionStatus;
  source: string;
  reason?: string;
  eventType?: string;
  rawEvent?: unknown;
}) {
  const normalizedEmail = normalizeEmail(email);

  return EmailSuppression.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $set: {
        email: normalizedEmail,
        status,
        source,
        reason,
        eventType,
        rawEvent,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

export async function isEmailSuppressed(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const suppression = await EmailSuppression.findOne({ email: normalizedEmail }).lean();

  return Boolean(suppression);
}
