import { FastifyInstance } from "fastify";
import { Contact } from "../models/Contact";

export async function contactRoutes(fastify: FastifyInstance) {
  fastify.post("/api/contact", async (request, reply) => {
    try {
      const { fullName, email, subject, message } = request.body as any;

      if (!fullName || !email || !message) {
        return reply.status(400).send({ success: false, error: "Missing required fields: fullName, email, message" });
      }

      const newContact = await Contact.create({
        fullName,
        email,
        subject: subject || "",
        message,
      });

      return reply.status(201).send({ success: true, data: newContact });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({ success: false, error: "Internal Server Error" });
    }
  });
}
