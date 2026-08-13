import crypto from "crypto";
import { Readable } from "stream";
import { FastifyInstance, FastifyRequest } from "fastify";
import { WhatsAppWebhookServiceContract } from "../services/whatsapp/whatsappService";
import { timingSafeStringEqual, validateMetaWebhookSignature } from "../services/whatsapp/webhookSignature";

type RawBodyRequest = FastifyRequest & { rawBody?: Buffer };

interface VerificationQuery {
  "hub.mode"?: string;
  "hub.verify_token"?: string;
  "hub.challenge"?: string;
}

export interface WhatsappWebhookRouteOptions {
  service: WhatsAppWebhookServiceContract;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function whatsappWebhookRoutes(
  fastify: FastifyInstance,
  options: WhatsappWebhookRouteOptions
): Promise<void> {
  fastify.get("/webhooks/whatsapp/health", async (_request, reply) => {
    return reply.status(200).send({ service: "whatsapp-webhook", status: "ok" });
  });

  fastify.get("/webhooks/whatsapp", async (request, reply) => {
    const query = request.query as VerificationQuery;
    const valid =
      query["hub.mode"] === "subscribe" &&
      timingSafeStringEqual(query["hub.verify_token"], process.env.WHATSAPP_VERIFY_TOKEN) &&
      typeof query["hub.challenge"] === "string";

    if (!valid) {
      request.log.warn(
        { event: "whatsapp_webhook_verification_failure", mode: query["hub.mode"] },
        "WhatsApp webhook verification failed"
      );
      return reply.status(403).send();
    }

    request.log.info(
      { event: "whatsapp_webhook_verification_success" },
      "WhatsApp webhook verification succeeded"
    );
    return reply.status(200).type("text/plain; charset=utf-8").send(query["hub.challenge"]);
  });

  fastify.post(
    "/webhooks/whatsapp",
    {
      preParsing: async (request, _reply, payload) => {
        const chunks: Buffer[] = [];
        for await (const chunk of payload) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }

        const rawBody = Buffer.concat(chunks);
        (request as RawBodyRequest).rawBody = rawBody;

        const replacement = Readable.from(rawBody) as Readable & { receivedEncodedLength: number };
        replacement.receivedEncodedLength = rawBody.length;
        return replacement;
      },
    },
    async (request, reply) => {
      const rawBody = (request as RawBodyRequest).rawBody;
      const signature = firstHeaderValue(request.headers["x-hub-signature-256"]);
      const signatureValidation = rawBody
        ? validateMetaWebhookSignature(rawBody, signature, process.env.META_APP_SECRET)
        : { valid: false as const, reason: "missing_signature" as const };

      if (!signatureValidation.valid) {
        request.log.warn(
          { event: "whatsapp_signature_validation_failure", reason: signatureValidation.reason },
          "WhatsApp webhook signature validation failed"
        );
        const status = signatureValidation.reason === "missing_secret" ? 503 : 401;
        return reply.status(status).send();
      }

      try {
        const receivedAt = new Date();
        const payloadHash = crypto.createHash("sha256").update(rawBody as Buffer).digest("hex");
        const receipt = await options.service.acceptWebhook(request.body, payloadHash, receivedAt);

        request.log.info(
          {
            event: "whatsapp_webhook_received",
            receivedCount: receipt.receivedCount,
            duplicateCount: receipt.duplicateCount,
            incomingMessageCount: receipt.incomingMessageCount,
            statusCount: receipt.statusCount,
            ignoredCount: receipt.ignoredCount,
          },
          "WhatsApp webhook received"
        );

        const response = reply.status(200).send();
        options.service.processEventKeysInBackground(receipt.eventKeysToProcess, request.log);
        return response;
      } catch (error) {
        request.log.error(
          {
            event: "whatsapp_webhook_intake_error",
            error:
              error instanceof Error
                ? { name: error.name, message: error.message }
                : { name: "UnknownError", message: "Unknown webhook intake error" },
          },
          "WhatsApp webhook intake failed"
        );
        return reply.status(500).send();
      }
    }
  );
}
