import { FastifyInstance } from "fastify";
import { Lead } from "../models/Lead";

export async function contactRoutes(fastify: FastifyInstance) {
  fastify.post("/api/contact", async (request, reply) => {
    try {
      const { fullName, name, email, phone, course, subject, message, source } = request.body as any;
      
      const resolvedName = fullName || name;

      if (!resolvedName || !email) {
        return reply.status(400).send({ success: false, error: "Missing required fields: fullName/name, email" });
      }

      // Determine source label — default to "Data Analytics Landing Page" since
      // this endpoint is called from the data-analyst frontend ApplicationForm.
      const resolvedSource = source || "Data Analytics Landing Page";

      const newLead = await Lead.create({
        name: resolvedName,
        email,
        phone,
        course: course || "Data Analytics Career Program",
        subject: subject || "Data Analytics Application",
        message: message || `User submitted an application for the Data Analytics Career Program.`,
        source: resolvedSource,
        status: "New",
        priority: "Medium",
        folder: resolvedSource,
      });

      return reply.status(201).send({ success: true, data: newLead });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({ success: false, error: "Internal Server Error" });
    }
  });
}
