import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { connectDB } from "./config/db";
import { courseRoutes } from "./routes/courses";
import { contactRoutes } from "./routes/contact";
import { leadRoutes } from "./routes/leads";
// Force PORT to 4000 (ignoring process.env.PORT) to prevent collisions with Next.js if standard PORT is globally set to 3000 in the shell.
const PORT = 4000;

async function buildServer() {
  const fastify = Fastify({
    logger: {
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

  return fastify;
}

async function start() {
  try {
    // 1. Connect to MongoDB
    await connectDB();

    // 2. Build and start the Fastify server
    const fastify = await buildServer();
    await fastify.listen({ port: PORT, host: "0.0.0.0" });

    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log(`   Health : http://localhost:${PORT}/health`);
    console.log(`   Courses: http://localhost:${PORT}/api/courses\n`);
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

start();
