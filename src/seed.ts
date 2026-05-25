import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "./config/db";
import { Course } from "./models/Course";

const SEED_COURSES = [
  {
    slug: "data-analytics",
    topBadge: "IN DEMAND",
    bottomLeftBadge: "DATA ANALYTICS",
    isPopular: true,
    title: "Data Analyst and Gen AI Certification Program",
    desc: "Learn data analysis, dashboards and AI tools for job-ready skills.",
    price: 3499,
    currency: "GBP",
    duration: "6 Months",
    projects: "Real-world use cases",
    gradient: "from-blue-500 to-blue-700",
    iconName: "BarChart",
    order: 1,
  },
  {
    slug: "data-science",
    topBadge: "ADVANCED",
    bottomLeftBadge: "DATA SCIENCE",
    isPopular: true,
    title: "Data Science & Machine Learning Certification Program",
    desc: "Build predictive models and advanced data systems.",
    price: 4499,
    currency: "GBP",
    duration: "12 Months",
    projects: "Predictive modeling",
    gradient: "from-teal-400 to-teal-600",
    iconName: "Code",
    order: 2,
  },
  {
    slug: "ai-automation",
    topBadge: "FEATURED",
    bottomLeftBadge: "AGENTIC AI",
    isPopular: true,
    title: "Agentic AI Certification Program",
    desc: "Build intelligent agent workflows and practical automation systems.",
    price: 1999,
    currency: "GBP",
    duration: "4 Months",
    projects: "Agent workflows",
    gradient: "from-purple-500 to-purple-700",
    iconName: "Layers",
    order: 3,
  },
  {
    slug: "gen-ai",
    topBadge: "FOUNDATION",
    bottomLeftBadge: "GEN AI",
    isPopular: false,
    title: "Generative AI Certificaation Program",
    desc: "Learn practical prompting, copilots, and real-world generative AI workflows.",
    price: 1200,
    currency: "GBP",
    duration: "3 Months",
    projects: "Prompting use cases",
    gradient: "from-amber-400 to-orange-500",
    iconName: "Sparkles",
    order: 4,
  },
];

async function seed() {
  await connectDB();

  console.log("🌱 Seeding courses...");

  for (const courseData of SEED_COURSES) {
    const updated = await Course.findOneAndUpdate(
      { slug: courseData.slug },
      { $set: courseData },
      { upsert: true, new: true, runValidators: true }
    );
    console.log(`  ✅ Upserted: ${updated.title}`);
  }

  console.log("\n✨ Seeding complete!");
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
