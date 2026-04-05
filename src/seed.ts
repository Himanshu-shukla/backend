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
    title: "Data Analytics Course with Generative AI",
    desc: "Learn data analysis, dashboards and AI tools for job-ready skills.",
    duration: "4-6 Months",
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
    title: "Data Science & Machine Learning Course",
    desc: "Build predictive models and advanced data systems.",
    duration: "6 Months",
    projects: "Predictive modeling",
    gradient: "from-teal-400 to-teal-600",
    iconName: "Code",
    order: 2,
  },
  {
    slug: "ai-automation",
    topBadge: "FEATURED",
    bottomLeftBadge: "AI & AUTOMATION",
    isPopular: true,
    title: "AI & Automation Course",
    desc: "Create intelligent workflows and automation solutions.",
    duration: "4 Months",
    projects: "Workflow automation",
    gradient: "from-purple-500 to-purple-700",
    iconName: "Layers",
    order: 3,
  },
];

async function seed() {
  await connectDB();

  console.log("🌱 Seeding courses...");

  for (const courseData of SEED_COURSES) {
    const existing = await Course.findOne({ slug: courseData.slug });
    if (existing) {
      console.log(`  ⚠️  Skipping "${courseData.title}" — already exists`);
      continue;
    }
    await Course.create(courseData);
    console.log(`  ✅ Created: ${courseData.title}`);
  }

  console.log("\n✨ Seeding complete!");
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
