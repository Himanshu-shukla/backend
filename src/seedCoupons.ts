import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "./config/db";
import { Coupon } from "./models/Coupon";

const SAMPLE_COUPONS = [
  {
    code: "BRIT100",
    description: "£100 off any Brit Institute course",
    discountType: "fixed",
    discountValue: 100,
  },
  {
    code: "BRIT250",
    description: "£250 off any Brit Institute course",
    discountType: "fixed",
    discountValue: 250,
  },
  {
    code: "DATA500",
    description: "£500 off data programmes",
    discountType: "fixed",
    discountValue: 500,
    courseSlugs: ["data-analytics", "data-science"],
  },
  {
    code: "AI150",
    description: "£150 off AI programmes",
    discountType: "fixed",
    discountValue: 150,
    courseSlugs: ["ai-automation", "gen-ai"],
  },
  {
    code: "WELCOME75",
    description: "£75 welcome discount",
    discountType: "fixed",
    discountValue: 75,
  },
  {
    code: "BRIT10",
    description: "10% off any Brit Institute course",
    discountType: "percentage",
    discountValue: 10,
  },
  {
    code: "CAREER15",
    description: "15% career switcher discount",
    discountType: "percentage",
    discountValue: 15,
  },
  {
    code: "DATA20",
    description: "20% off data programmes",
    discountType: "percentage",
    discountValue: 20,
    courseSlugs: ["data-analytics", "data-science"],
  },
  {
    code: "AI25",
    description: "25% off AI programmes",
    discountType: "percentage",
    discountValue: 25,
    courseSlugs: ["ai-automation", "gen-ai"],
  },
  {
    code: "VIP30",
    description: "30% VIP discount",
    discountType: "percentage",
    discountValue: 30,
  },
  {
    code: "SAVE10",
    description: "10% off any course",
    discountType: "percentage",
    discountValue: 10,
  },
  {
    code: "SAVE15",
    description: "15% off any course",
    discountType: "percentage",
    discountValue: 15,
  },
  {
    code: "SAVE20",
    description: "20% off any course",
    discountType: "percentage",
    discountValue: 20,
  },
  {
    code: "SAVE25",
    description: "25% off any course",
    discountType: "percentage",
    discountValue: 25,
  },
  {
    code: "SAVE30",
    description: "30% off any course",
    discountType: "percentage",
    discountValue: 30,
  },
  {
    code: "SAVE35",
    description: "35% off any course",
    discountType: "percentage",
    discountValue: 35,
  },
  {
    code: "SAVE40",
    description: "40% off any course",
    discountType: "percentage",
    discountValue: 40,
  },
  {
    code: "SAVE45",
    description: "45% off any course",
    discountType: "percentage",
    discountValue: 45,
  },
  {
    code: "SAVE50",
    description: "50% off any course",
    discountType: "percentage",
    discountValue: 50,
  },
  {
    code: "SAVE55",
    description: "55% off any course",
    discountType: "percentage",
    discountValue: 55,
  },
  {
    code: "SAVE60",
    description: "60% off any course",
    discountType: "percentage",
    discountValue: 60,
  },
  {
    code: "SAVE65",
    description: "65% off any course",
    discountType: "percentage",
    discountValue: 65,
  },
  {
    code: "SAVE70",
    description: "70% off any course",
    discountType: "percentage",
    discountValue: 70,
  },
  {
    code: "SAVE75",
    description: "75% off any course",
    discountType: "percentage",
    discountValue: 75,
  },
  {
    code: "SAVE80",
    description: "80% off any course",
    discountType: "percentage",
    discountValue: 80,
  },
  {
    code: "SAVE85",
    description: "85% off any course",
    discountType: "percentage",
    discountValue: 85,
  },
  {
    code: "SAVE90",
    description: "90% off any course",
    discountType: "percentage",
    discountValue: 90,
  },
] as const;

async function seedCoupons() {
  await connectDB();

  console.log("Seeding sample coupons...");

  for (const coupon of SAMPLE_COUPONS) {
    const updated = await Coupon.findOneAndUpdate(
      { code: coupon.code },
      {
        $set: {
          currency: "GBP",
          active: true,
          courseSlugs: [],
          maxRedemptions: 500,
          ...coupon,
        },
        $setOnInsert: {
          redeemedCount: 0,
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    console.log(`  Upserted ${updated.code}: ${updated.description}`);
  }

  console.log("Coupon seeding complete.");
  await mongoose.disconnect();
  process.exit(0);
}

seedCoupons().catch(async (err) => {
  console.error("Coupon seed failed:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
