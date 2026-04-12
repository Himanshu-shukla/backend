import { FastifyInstance } from "fastify";
import { Contact } from "../models/Contact";

export async function contactRoutes(fastify: FastifyInstance) {
  fastify.post("/api/contact", async (request, reply) => {
    try {
      const { fullName, name, email, phone, course, subject, message } = request.body as any;
      
      const resolvedName = fullName || name;

      if (!resolvedName || !email) {
        return reply.status(400).send({ success: false, error: "Missing required fields: fullName/name, email" });
      }

      const newContact = await Contact.create({
        fullName: resolvedName,
        email,
        phone,
        course,
        subject: subject || "Contact Form Submission",
        message: message || `User submitted details.`,
      });

      return reply.status(201).send({ success: true, data: newContact });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({ success: false, error: "Internal Server Error" });
    }
  });
}
