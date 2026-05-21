import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { FastifyInstance } from "fastify";
import { buildUnsubscribeUrl, isEmailSuppressed } from "../utils/emailSuppression";

const DEFAULT_FROM_EMAIL = "info@britinstitute.uk";
const DEFAULT_TO_EMAIL = "info@britinstitute.uk";

const sesClient = new SESv2Client({
  region: process.env.AWS_REGION || process.env.AWS_SES_REGION || "eu-west-2",
});

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildSampleHtml(name: string, toEmail: string) {
  const safeName = escapeHtml(name || "Test Student");
  const unsubscribeUrl = buildUnsubscribeUrl(toEmail);

  return `
    <div style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#111827;">
      <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
          <div style="background:#6d28d9;color:#ffffff;padding:24px 28px;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">Brit Institute</p>
            <h1 style="margin:0;font-size:24px;line-height:1.25;">SES test email delivered</h1>
          </div>
          <div style="padding:28px;">
            <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hi ${safeName},</p>
            <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
              This is a sample HTML email sent from the Brit Institute backend through AWS SES.
              If you can read this in your inbox, the SES API endpoint is working.
            </p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
              <tr>
                <td style="padding:10px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700;">Status</td>
                <td style="padding:10px 12px;border:1px solid #e5e7eb;">Success test</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700;">Source</td>
                <td style="padding:10px 12px;border:1px solid #e5e7eb;">/api/test-ses-email</td>
              </tr>
            </table>
            <p style="margin:18px 0 0;font-size:13px;color:#6b7280;">
              You can delete this email after testing.
            </p>
            <div style="margin-top:26px;border-top:1px solid #e5e7eb;padding-top:18px;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">
                You are receiving this email because you requested updates from Brit Institute.
                <a href="${unsubscribeUrl}" style="color:#6d28d9;">Unsubscribe</a>
                from future email updates.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function buildSampleText(name: string, toEmail: string) {
  const unsubscribeUrl = buildUnsubscribeUrl(toEmail);

  return [
    `Hi ${name || "Test Student"},`,
    "",
    "This is a sample HTML email sent from the Brit Institute backend through AWS SES.",
    "If you received this, the SES API endpoint is working.",
    "",
    `Unsubscribe from future email updates: ${unsubscribeUrl}`,
  ].join("\n");
}

function buildTestPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Brit Institute SES Test</title>
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
        width: min(520px, calc(100% - 32px));
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 14px;
        padding: 28px;
        box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
      }
      h1 {
        margin: 0 0 8px;
        font-size: 24px;
      }
      p {
        margin: 0 0 22px;
        color: #4b5563;
        line-height: 1.6;
      }
      label {
        display: block;
        margin: 14px 0 6px;
        font-size: 13px;
        font-weight: 700;
      }
      input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        padding: 12px;
        font-size: 14px;
      }
      button {
        margin-top: 18px;
        width: 100%;
        border: 0;
        border-radius: 8px;
        padding: 13px 16px;
        background: #6d28d9;
        color: white;
        font-weight: 800;
        cursor: pointer;
      }
      pre {
        min-height: 22px;
        margin: 18px 0 0;
        white-space: pre-wrap;
        color: #374151;
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>SES Test Email</h1>
      <p>Send a sample HTML email from the backend using AWS SES.</p>
      <form id="ses-form">
        <label for="toEmail">Send to</label>
        <input id="toEmail" name="toEmail" type="email" value="${escapeHtml(process.env.SES_TO_EMAIL || DEFAULT_TO_EMAIL)}" required />
        <label for="fromEmail">Send from</label>
        <input id="fromEmail" name="fromEmail" type="email" value="${escapeHtml(process.env.SES_FROM_EMAIL || DEFAULT_FROM_EMAIL)}" required />
        <label for="name">Name in email</label>
        <input id="name" name="name" type="text" value="Test Student" required />
        <button type="submit">Send test email</button>
      </form>
      <pre id="result"></pre>
    </main>
    <script>
      const form = document.getElementById("ses-form");
      const result = document.getElementById("result");

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        result.textContent = "Sending...";

        const body = {
          fromEmail: form.fromEmail.value,
          toEmail: form.toEmail.value,
          name: form.name.value
        };

        try {
          const response = await fetch("/api/test-ses-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });
          const data = await response.json();
          result.textContent = JSON.stringify(data, null, 2);
        } catch (error) {
          result.textContent = error.message || "Request failed";
        }
      });
    </script>
  </body>
</html>`;
}

export async function testSesRoutes(fastify: FastifyInstance) {
  fastify.get("/test-ses", async (_request, reply) => {
    return reply.type("text/html").send(buildTestPage());
  });

  fastify.post("/api/test-ses-email", async (request, reply) => {
    const body = request.body as { fromEmail?: string; toEmail?: string; name?: string; subject?: string } | null;
    const toEmail = body?.toEmail?.trim() || process.env.SES_TO_EMAIL || DEFAULT_TO_EMAIL;
    const fromEmail = body?.fromEmail?.trim() || process.env.SES_FROM_EMAIL || DEFAULT_FROM_EMAIL;
    const name = body?.name?.trim() || "Test Student";
    const subject = body?.subject?.trim() || "Brit Institute SES test email";
    const unsubscribeUrl = buildUnsubscribeUrl(toEmail);

    if (await isEmailSuppressed(toEmail)) {
      return reply.status(409).send({
        success: false,
        error: "Recipient is unsubscribed, bounced, or complained and will not receive future updates.",
        toEmail,
      });
    }

    try {
      const response = await sesClient.send(
        new SendEmailCommand({
          FromEmailAddress: fromEmail,
          Destination: {
            ToAddresses: [toEmail],
          },
          Content: {
            Simple: {
              Subject: {
                Charset: "UTF-8",
                Data: subject,
              },
              Body: {
                Text: {
                  Charset: "UTF-8",
                  Data: buildSampleText(name, toEmail),
                },
                Html: {
                  Charset: "UTF-8",
                  Data: buildSampleHtml(name, toEmail),
                },
              },
              Headers: [
                {
                  Name: "List-Unsubscribe",
                  Value: `<${unsubscribeUrl}>`,
                },
                {
                  Name: "List-Unsubscribe-Post",
                  Value: "List-Unsubscribe=One-Click",
                },
              ],
            },
          },
        })
      );

      return reply.status(200).send({
        success: true,
        messageId: response.MessageId,
        toEmail,
        fromEmail,
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: error?.message || "Failed to send SES test email",
      });
    }
  });
}
