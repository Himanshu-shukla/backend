import { FastifyInstance } from "fastify";
import {
  isEmailSuppressed,
  normalizeEmail,
  suppressEmail,
  verifyUnsubscribeToken,
} from "../utils/emailSuppression";

function buildUnsubscribePage({
  title,
  message,
  status = "success",
}: {
  title: string;
  message: string;
  status?: "success" | "error";
}) {
  const color = status === "success" ? "#047857" : "#b91c1c";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f4f7fb;
        color: #111827;
        font-family: Arial, sans-serif;
      }
      main {
        width: min(560px, calc(100% - 32px));
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 14px;
        padding: 30px;
        box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
      }
      h1 {
        margin: 0 0 10px;
        color: ${color};
        font-size: 24px;
      }
      p {
        margin: 0;
        color: #4b5563;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${message}</p>
    </main>
  </body>
</html>`;
}

function parseSnsBody(body: unknown) {
  if (typeof body === "string") {
    return JSON.parse(body);
  }

  return body as Record<string, unknown>;
}

function parseSnsMessage(message: unknown) {
  if (typeof message === "string") {
    return JSON.parse(message);
  }

  return message as Record<string, any>;
}

function getBounceRecipients(message: Record<string, any>) {
  return (message.bounce?.bouncedRecipients || [])
    .map((recipient: any) => recipient.emailAddress)
    .filter(Boolean);
}

function getComplaintRecipients(message: Record<string, any>) {
  return (message.complaint?.complainedRecipients || [])
    .map((recipient: any) => recipient.emailAddress)
    .filter(Boolean);
}

async function unsubscribeEmail(email: string, source: string) {
  return suppressEmail({
    email,
    status: "unsubscribed",
    source,
    reason: "User clicked unsubscribe link",
  });
}

export async function emailComplianceRoutes(fastify: FastifyInstance) {
  fastify.get("/unsubscribe", async (request, reply) => {
    const query = request.query as { email?: string; token?: string };
    const email = query.email?.trim();
    const token = query.token?.trim();

    if (!email || !token || !verifyUnsubscribeToken(email, token)) {
      return reply
        .status(400)
        .type("text/html")
        .send(
          buildUnsubscribePage({
            status: "error",
            title: "Invalid unsubscribe link",
            message: "This unsubscribe link is missing information or has expired.",
          })
        );
    }

    await unsubscribeEmail(email, "unsubscribe_link");

    return reply.type("text/html").send(
      buildUnsubscribePage({
        title: "You have been unsubscribed",
        message: `${normalizeEmail(email)} will no longer receive future email updates from Brit Institute.`,
      })
    );
  });

  fastify.post("/unsubscribe", async (request, reply) => {
    const query = request.query as { email?: string; token?: string };
    const email = query.email?.trim();
    const token = query.token?.trim();

    if (!email || !token || !verifyUnsubscribeToken(email, token)) {
      return reply.status(400).send({ success: false, error: "Invalid unsubscribe link" });
    }

    await unsubscribeEmail(email, "one_click_unsubscribe");

    return reply.status(200).send({ success: true, email: normalizeEmail(email) });
  });

  fastify.post("/api/unsubscribe", async (request, reply) => {
    const body = request.body as { email?: string; token?: string } | null;
    const email = body?.email?.trim();
    const token = body?.token?.trim();

    if (!email || !token || !verifyUnsubscribeToken(email, token)) {
      return reply.status(400).send({ success: false, error: "Invalid unsubscribe request" });
    }

    await unsubscribeEmail(email, "unsubscribe_api");

    return reply.status(200).send({ success: true, email: normalizeEmail(email) });
  });

  fastify.get("/api/email-suppressions/:email", async (request, reply) => {
    const params = request.params as { email: string };
    const email = normalizeEmail(params.email);

    return reply.status(200).send({
      success: true,
      email,
      suppressed: await isEmailSuppressed(email),
    });
  });

  fastify.post("/api/ses/events", async (request, reply) => {
    try {
      const snsBody = parseSnsBody(request.body);
      const snsType = snsBody.Type || snsBody.type;

      if (snsType === "SubscriptionConfirmation") {
        return reply.status(200).send({
          success: true,
          message: "SNS subscription confirmation received. Confirm the SubscribeURL in AWS if needed.",
          subscribeUrl: snsBody.SubscribeURL,
        });
      }

      const message = parseSnsMessage(snsBody.Message);
      const notificationType = message.notificationType || message.eventType;

      if (notificationType === "Bounce") {
        const recipients = getBounceRecipients(message);

        await Promise.all(
          recipients.map((email: string) =>
            suppressEmail({
              email,
              status: "bounced",
              source: "ses_bounce",
              reason: message.bounce?.bounceType || "SES bounce",
              eventType: message.bounce?.bounceSubType,
              rawEvent: message,
            })
          )
        );

        return reply.status(200).send({ success: true, suppressed: recipients.length, type: "Bounce" });
      }

      if (notificationType === "Complaint") {
        const recipients = getComplaintRecipients(message);

        await Promise.all(
          recipients.map((email: string) =>
            suppressEmail({
              email,
              status: "complained",
              source: "ses_complaint",
              reason: "SES complaint",
              eventType: message.complaint?.complaintFeedbackType,
              rawEvent: message,
            })
          )
        );

        return reply.status(200).send({ success: true, suppressed: recipients.length, type: "Complaint" });
      }

      return reply.status(200).send({ success: true, ignored: true, type: notificationType || "unknown" });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(400).send({ success: false, error: error?.message || "Invalid SES event payload" });
    }
  });
}
