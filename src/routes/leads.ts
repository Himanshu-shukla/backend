import { FastifyInstance } from "fastify";
import { Lead } from "../models/Lead";

export async function leadRoutes(fastify: FastifyInstance) {
  fastify.post("/api/leads", async (request, reply) => {
    try {
      // Accommodate multiple form structures (OfferModal vs ContactPage vs CourseLeadForm)
      const { 
        name, fullName, 
        email, 
        phone, 
        course, 
        purpose, 
        subject, 
        message, 
        source 
      } = request.body as any;

      const unifiedName = name || fullName;

      if (!unifiedName || !email) {
        return reply.status(400).send({ success: false, error: "Missing required fields: name/fullName, email" });
      }

      const newLead = await Lead.create({
        name: unifiedName,
        email,
        phone,
        course,
        purpose,
        subject,
        message,
        source: source || "Website",
      });

      return reply.status(201).send({ success: true, data: newLead });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({ success: false, error: "Internal Server Error" });
    }
  });
}
