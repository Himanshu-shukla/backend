import crypto from "crypto";

const META_SIGNATURE_PREFIX = "sha256=";
const SHA256_HEX_LENGTH = 64;

export type SignatureValidationResult =
  | { valid: true }
  | { valid: false; reason: "missing_secret" | "missing_signature" | "invalid_format" | "mismatch" };

export function validateMetaWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string | undefined
): SignatureValidationResult {
  if (!appSecret) return { valid: false, reason: "missing_secret" };
  if (!signatureHeader) return { valid: false, reason: "missing_signature" };

  const signaturePattern = new RegExp(`^${META_SIGNATURE_PREFIX}[a-fA-F0-9]{${SHA256_HEX_LENGTH}}$`);
  if (!signaturePattern.test(signatureHeader)) {
    return { valid: false, reason: "invalid_format" };
  }

  const receivedDigest = Buffer.from(signatureHeader.slice(META_SIGNATURE_PREFIX.length), "hex");
  const expectedDigest = crypto.createHmac("sha256", appSecret).update(rawBody).digest();

  if (receivedDigest.length !== expectedDigest.length) {
    return { valid: false, reason: "mismatch" };
  }

  return crypto.timingSafeEqual(receivedDigest, expectedDigest)
    ? { valid: true }
    : { valid: false, reason: "mismatch" };
}

export function timingSafeStringEqual(actual: string | undefined, expected: string | undefined): boolean {
  if (!actual || !expected) return false;

  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
