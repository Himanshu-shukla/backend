import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Course } from "../models/Course";

export async function courseRoutes(fastify: FastifyInstance) {
  // ─── GET /api/courses ─────────────────────────────────────────────────────
  // Returns all courses sorted by `order`
  fastify.get("/api/courses", async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const courses = await Course.find().sort({ order: 1 }).lean();
      return reply.status(200).send({ success: true, data: courses });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ success: false, message: "Failed to fetch courses" });
    }
  });

  // ─── GET /api/courses/:slug ───────────────────────────────────────────────
  // Returns a single course by slug
  fastify.get(
    "/api/courses/:slug",
    async (
      req: FastifyRequest<{ Params: { slug: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const course = await Course.findOne({ slug: req.params.slug }).lean();
        if (!course) {
          return reply.status(404).send({ success: false, message: "Course not found" });
        }
        return reply.status(200).send({ success: true, data: course });
      } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ success: false, message: "Failed to fetch course" });
      }
    }
  );

  // ─── POST /api/courses ────────────────────────────────────────────────────
  // Creates a new course
  fastify.post(
    "/api/courses",
    async (
      req: FastifyRequest<{ Body: Record<string, unknown> }>,
      reply: FastifyReply
    ) => {
      try {
        const course = await Course.create(req.body);
        return reply.status(201).send({ success: true, data: course });
      } catch (err: unknown) {
        fastify.log.error(err);
        const message = err instanceof Error ? err.message : "Failed to create course";
        return reply.status(400).send({ success: false, message });
      }
    }
  );

  // ─── PUT /api/courses/:slug ───────────────────────────────────────────────
  // Updates an existing course by slug
  fastify.put(
    "/api/courses/:slug",
    async (
      req: FastifyRequest<{ Params: { slug: string }; Body: Record<string, unknown> }>,
      reply: FastifyReply
    ) => {
      try {
        const course = await Course.findOneAndUpdate(
          { slug: req.params.slug },
          { $set: req.body },
          { new: true, runValidators: true }
        ).lean();
        if (!course) {
          return reply.status(404).send({ success: false, message: "Course not found" });
        }
        return reply.status(200).send({ success: true, data: course });
      } catch (err: unknown) {
        fastify.log.error(err);
        const message = err instanceof Error ? err.message : "Failed to update course";
        return reply.status(400).send({ success: false, message });
      }
    }
  );

  // ─── DELETE /api/courses/:slug ────────────────────────────────────────────
  // Deletes a course by slug
  fastify.delete(
    "/api/courses/:slug",
    async (
      req: FastifyRequest<{ Params: { slug: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const course = await Course.findOneAndDelete({ slug: req.params.slug }).lean();
        if (!course) {
          return reply.status(404).send({ success: false, message: "Course not found" });
        }
        return reply.status(200).send({ success: true, message: "Course deleted successfully" });
      } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ success: false, message: "Failed to delete course" });
      }
    }
  );
}
