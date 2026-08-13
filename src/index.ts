import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { connectDB } from "./config/db";
import { courseRoutes } from "./routes/courses";
import { contactRoutes } from "./routes/contact";
import { emailComplianceRoutes } from "./routes/emailCompliance";
import { leadRoutes } from "./routes/leads";
import { paymentRoutes } from "./routes/payments";
import { testSesRoutes } from "./routes/testSes";
import { whatsappWebhookRoutes } from "./routes/whatsappWebhook";
import { initializeWhatsAppPersistence } from "./services/whatsapp/whatsappPersistence";
import { WhatsAppService } from "./services/whatsapp/whatsappService";
// Force PORT to 4000 (ignoring process.env.PORT) to prevent collisions with Next.js if standard PORT is globally set to 3000 in the shell.
const PORT = 4000;

export async function buildServer(whatsappService = new WhatsAppService()) {
  const fastify = Fastify({
    logger: {
      redact: ["req.headers.authorization", "req.headers.x-hub-signature-256"],
      serializers: {
        // Verification tokens are query parameters, so request logs retain the
        // route path but intentionally omit every query string.
        req(request: {
          method?: string;
          url?: string;
          hostname?: string;
          remoteAddress?: string;
          remotePort?: number;
        }) {
          return {
            method: request.method,
            url: request.url?.split("?", 1)[0],
            hostname: request.hostname,
            remoteAddress: request.remoteAddress,
            remotePort: request.remotePort,
          };
        },
      },
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      },
    },
  });

  // ── CORS ──────────────────────────────────────────────────────────────────
  await fastify.register(cors, {
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://britinstitute.uk",
      "https://www.britinstitute.uk",
      "https://sixfigurecareer.britinstitute.uk",
      "https://www.sixfigurecareer.britinstitute.uk",
      "https://learnifyops.com",
      "https://www.learnifyops.com"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  // ── Health check ──────────────────────────────────────────────────────────
  fastify.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  await fastify.register(courseRoutes);
  await fastify.register(contactRoutes);
  await fastify.register(leadRoutes);
  await fastify.register(paymentRoutes);
  await fastify.register(emailComplianceRoutes);
  await fastify.register(testSesRoutes);
  await fastify.register(whatsappWebhookRoutes, { service: whatsappService });

  return fastify;
}

export async function start() {
  try {
    // 1. Connect to MongoDB
    await connectDB();

    // 2. Ensure database-enforced webhook idempotency indexes exist.
    await initializeWhatsAppPersistence();

    // 3. Build and start the Fastify server.
    const whatsappService = new WhatsAppService();
    const fastify = await buildServer(whatsappService);
    await fastify.listen({ port: PORT, host: "0.0.0.0" });
    whatsappService.processPendingEventsInBackground(fastify.log);

    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log(`   Health : http://localhost:${PORT}/health`);
    console.log(`   Courses: http://localhost:${PORT}/api/courses\n`);
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

if (require.main === module) {
  void start();
}
