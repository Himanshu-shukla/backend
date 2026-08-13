type UnknownRecord = Record<string, unknown>;

export interface SendTemplateMessageInput {
  recipient: string;
  templateName: string;
  languageCode: string;
  templateParameters?: readonly string[];
}

export interface SendTemplateMessageResult {
  messageId?: string;
  metaMessageStatus?: string;
  response: unknown;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function graphApiVersion(): string {
  const configured = requiredEnvironmentVariable("META_GRAPH_API_VERSION");
  const version = configured.startsWith("v") ? configured : `v${configured}`;
  if (!/^v\d+\.\d+$/.test(version)) {
    throw new Error("META_GRAPH_API_VERSION must look like vXX.X");
  }
  return version;
}

function phoneNumberId(): string {
  const id = requiredEnvironmentVariable("WHATSAPP_PHONE_NUMBER_ID");
  if (!/^\d+$/.test(id)) throw new Error("WHATSAPP_PHONE_NUMBER_ID is invalid");
  return id;
}

function normalizedRecipient(recipient: string): string {
  const normalized = recipient.replace(/[+\s()-]/g, "");
  if (!/^\d{7,15}$/.test(normalized)) {
    throw new Error("WhatsApp recipient must be a valid international phone number");
  }
  return normalized;
}

function validateTemplateInput(input: SendTemplateMessageInput): void {
  if (!/^[a-z0-9_]+$/.test(input.templateName)) {
    throw new Error("WhatsApp templateName is invalid");
  }
  if (!/^[A-Za-z]{2,3}(?:_[A-Za-z]{2})?$/.test(input.languageCode)) {
    throw new Error("WhatsApp languageCode is invalid");
  }
}

function graphErrorCode(payload: unknown): string | undefined {
  const error = isRecord(payload) ? payload.error : undefined;
  const code = isRecord(error) ? error.code : undefined;
  return typeof code === "number" || typeof code === "string" ? String(code) : undefined;
}

export class WhatsAppGraphApiService {
  async sendTemplateMessage(input: SendTemplateMessageInput): Promise<SendTemplateMessageResult> {
    validateTemplateInput(input);

    const bodyParameters = input.templateParameters?.map((text) => ({ type: "text", text }));
    const response = await fetch(
      `https://graph.facebook.com/${graphApiVersion()}/${phoneNumberId()}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${requiredEnvironmentVariable("WHATSAPP_ACCESS_TOKEN")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: normalizedRecipient(input.recipient),
          type: "template",
          template: {
            name: input.templateName,
            language: { code: input.languageCode },
            ...(bodyParameters?.length
              ? { components: [{ type: "body", parameters: bodyParameters }] }
              : {}),
          },
        }),
      }
    );

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }

    if (!response.ok) {
      const code = graphErrorCode(payload);
      throw new Error(
        `WhatsApp Graph API request failed with HTTP ${response.status}${code ? ` (Meta code ${code})` : ""}`
      );
    }

    const messages = isRecord(payload) && Array.isArray(payload.messages) ? payload.messages : [];
    const firstMessage = isRecord(messages[0]) ? messages[0] : undefined;

    return {
      messageId: typeof firstMessage?.id === "string" ? firstMessage.id : undefined,
      metaMessageStatus:
        typeof firstMessage?.message_status === "string" ? firstMessage.message_status : undefined,
      response: payload,
    };
  }
}
