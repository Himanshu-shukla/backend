import crypto from "crypto";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Coupon } from "../models/Coupon";
import { Course } from "../models/Course";

type CoursePaymentDetails = {
  slug: string;
  title: string;
  amount: number;
  currency: string;
};

type RazorpayOrderBody = {
  courseSlug?: string;
  couponCode?: string;
};

type RazorpayVerifyBody = {
  courseSlug?: string;
  couponCode?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};

type PayPalOrderBody = {
  courseSlug?: string;
  couponCode?: string;
};

type PayPalCaptureBody = {
  courseSlug?: string;
  orderID?: string;
  couponCode?: string;
};

type CouponValidateBody = {
  courseSlug?: string;
  couponCode?: string;
};

type AppliedDiscount = {
  code: string;
  description: string;
  discountType: "fixed" | "percentage";
  discountValue: number;
  discountAmount: number;
  originalAmount: number;
  finalAmount: number;
  currency: string;
};

const FALLBACK_COURSES: Record<string, CoursePaymentDetails> = {
  "data-analytics": {
    slug: "data-analytics",
    title: "Data Analytics and Gen AI Certification Program",
    amount: 3499,
    currency: "GBP",
  },
  "data-science": {
    slug: "data-science",
    title: "Data Science, Machine Learning and Gen AI Certification Program",
    amount: 4499,
    currency: "GBP",
  },
  "ai-automation": {
    slug: "ai-automation",
    title: "Agentic AI Certification Program",
    amount: 1999,
    currency: "GBP",
  },
  "gen-ai": {
    slug: "gen-ai",
    title: "Generative AI Certification Program",
    amount: 1200,
    currency: "GBP",
  },
};

function toMinorUnits(amount: number) {
  return Math.round(amount * 100);
}

function formatPayPalAmount(amount: number) {
  return amount.toFixed(2);
}

function normalizeCouponCode(code?: string) {
  return code?.trim().toUpperCase() ?? "";
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function getPaymentMode(): "live" | "sandbox" {
  const mode =
    process.env.PAYMENT_MODE ??
    process.env.PAYMENTS_MODE ??
    process.env.PAYPAL_ENVIRONMENT ??
    process.env.NODE_ENV;

  return mode?.trim().toLowerCase() === "live" ? "live" : "sandbox";
}

function isLivePaymentMode() {
  return getPaymentMode() === "live";
}

function getFirstEnvValue(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return "";
}

function getRequiredFirstEnv(names: string[]) {
  const value = getFirstEnvValue(names);
  if (!value) {
    throw new Error(`${names.join(" or ")} is not configured`);
  }

  return value;
}

function getPayPalBaseUrl() {
  return isLivePaymentMode()
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

function getPayPalClientId() {
  return isLivePaymentMode()
    ? getFirstEnvValue(["PAYPAL_CLIENT_ID_LIVE"])
    : getFirstEnvValue(["PAYPAL_CLIENT_ID"]);
}

function getPayPalClientSecret() {
  return isLivePaymentMode()
    ? getFirstEnvValue(["PAYPAL_CLIENT_SECRET_LIVE"])
    : getFirstEnvValue(["PAYPAL_CLIENT_SECRET"]);
}

function getRazorpayKeyId() {
  return isLivePaymentMode()
    ? getRequiredFirstEnv(["RAZORPAY_KEY_ID_LIVE", "RAZORPAY_KEY_ID_PROD"])
    : getRequiredFirstEnv(["RAZORPAY_KEY_ID"]);
}

function getRazorpayKeySecret() {
  return isLivePaymentMode()
    ? getRequiredFirstEnv(["RAZORPAY_KEY_SECRET_LIVE", "RAZORPAY_KEY_SECRET_PROD"])
    : getRequiredFirstEnv(["RAZORPAY_KEY_SECRET"]);
}

function getBasicAuth(username: string, password: string) {
  return Buffer.from(`${username}:${password}`).toString("base64");
}

function getPaymentLinkEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

async function parseGatewayResponse<T>(response: Response) {
  const data = (await response.json().catch(() => null)) as T | null;

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : `Gateway request failed with ${response.status}`;
    throw new Error(message);
  }

  if (!data) {
    throw new Error("Gateway returned an empty response");
  }

  return data;
}

async function resolveCoursePaymentDetails(slug?: string): Promise<CoursePaymentDetails> {
  if (!slug) {
    throw new Error("Course slug is required");
  }

  const fallback = FALLBACK_COURSES[slug];
  const course = await Course.findOne({ slug })
    .select("slug title price currency")
    .lean<{ slug: string; title: string; price: number; currency?: string }>();

  if (!course && !fallback) {
    throw new Error("Course not found");
  }

  const title = course?.title ?? fallback?.title;
  const amount = course?.price && course.price > 0 ? course.price : fallback?.amount;
  const currency = course?.currency ?? fallback?.currency;

  if (!title || !amount || !currency) {
    throw new Error("Course payment details are incomplete");
  }

  return {
    slug,
    title,
    amount,
    currency: currency.toUpperCase(),
  };
}

async function applyCouponToCourse(
  course: CoursePaymentDetails,
  couponCode?: string
): Promise<{ course: CoursePaymentDetails; discount: AppliedDiscount | null }> {
  const code = normalizeCouponCode(couponCode);
  if (!code) {
    return { course, discount: null };
  }

  const coupon = await Coupon.findOne({ code }).lean<{
    code: string;
    description: string;
    discountType: "fixed" | "percentage";
    discountValue: number;
    currency?: string;
    active: boolean;
    courseSlugs?: string[];
    maxRedemptions?: number;
    redeemedCount?: number;
    startsAt?: Date;
    expiresAt?: Date;
  }>();

  if (!coupon || !coupon.active) {
    throw new Error("Coupon code is invalid");
  }

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    throw new Error("Coupon code is not active yet");
  }

  if (coupon.expiresAt && coupon.expiresAt < now) {
    throw new Error("Coupon code has expired");
  }

  if (coupon.maxRedemptions && (coupon.redeemedCount ?? 0) >= coupon.maxRedemptions) {
    throw new Error("Coupon code has reached its usage limit");
  }

  if (coupon.courseSlugs?.length && !coupon.courseSlugs.includes(course.slug)) {
    throw new Error("Coupon code is not valid for this course");
  }

  if (coupon.discountType === "fixed" && (coupon.currency ?? "GBP").toUpperCase() !== course.currency) {
    throw new Error("Coupon currency does not match this course");
  }

  const rawDiscount =
    coupon.discountType === "percentage"
      ? course.amount * (coupon.discountValue / 100)
      : coupon.discountValue;
  const discountAmount = Math.min(course.amount, roundCurrency(rawDiscount));
  const finalAmount = Math.max(0, roundCurrency(course.amount - discountAmount));

  return {
    course: {
      ...course,
      amount: finalAmount,
    },
    discount: {
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount,
      originalAmount: course.amount,
      finalAmount,
      currency: course.currency,
    },
  };
}

async function markCouponRedeemed(couponCode?: string) {
  const code = normalizeCouponCode(couponCode);
  if (!code) return;

  await Coupon.updateOne({ code }, { $inc: { redeemedCount: 1 } });
}

async function getPayPalAccessToken() {
  const clientId = getPayPalClientId();
  const clientSecret = getPayPalClientSecret();

  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials are not configured");
  }

  const response = await fetch(`${getPayPalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${getBasicAuth(clientId, clientSecret)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await parseGatewayResponse<{ access_token: string }>(response);
  return data.access_token;
}

export async function paymentRoutes(fastify: FastifyInstance) {
  fastify.get("/api/payments/config", async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      success: true,
      data: {
        razorpayKeyId: getFirstEnvValue(
          isLivePaymentMode() ? ["RAZORPAY_KEY_ID_LIVE", "RAZORPAY_KEY_ID_PROD"] : ["RAZORPAY_KEY_ID"]
        ),
        paypalClientId: getPayPalClientId(),
        paypalCurrency: "GBP",
        paypalEnvironment: getPaymentMode(),
        paypalPayLaterMinAmount: 30,
        paypalPayLaterMaxAmount: 2000,
        paymentLinks: {
          razorpayPaymentPageUrl: getPaymentLinkEnv("RAZORPAY_PAYMENT_PAGE_URL"),
          paypalMeUrl: getPaymentLinkEnv("PAYPAL_ME_URL"),
        },
      },
    });
  });

  fastify.post(
    "/api/payments/coupons/validate",
    async (req: FastifyRequest<{ Body: CouponValidateBody }>, reply: FastifyReply) => {
      try {
        const course = await resolveCoursePaymentDetails(req.body.courseSlug);
        const pricing = await applyCouponToCourse(course, req.body.couponCode);

        if (!pricing.discount) {
          return reply.status(400).send({ success: false, message: "Coupon code is required" });
        }

        return reply.status(200).send({
          success: true,
          data: pricing.discount,
        });
      } catch (err) {
        fastify.log.error(err);
        const message = err instanceof Error ? err.message : "Failed to validate coupon";
        const status = message === "Course not found" ? 404 : 400;
        return reply.status(status).send({ success: false, message });
      }
    }
  );

  fastify.post(
    "/api/payments/razorpay/order",
    async (req: FastifyRequest<{ Body: RazorpayOrderBody }>, reply: FastifyReply) => {
      try {
        const baseCourse = await resolveCoursePaymentDetails(req.body.courseSlug);
        const { course, discount } = await applyCouponToCourse(baseCourse, req.body.couponCode);
        const keyId = getRazorpayKeyId();
        const keySecret = getRazorpayKeySecret();
        const receipt = `rcpt_${Date.now().toString(36)}_${course.slug}`.slice(0, 40);

        const response = await fetch("https://api.razorpay.com/v1/orders", {
          method: "POST",
          headers: {
            Authorization: `Basic ${getBasicAuth(keyId, keySecret)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: toMinorUnits(course.amount),
            currency: course.currency,
            receipt,
            notes: {
              courseSlug: course.slug,
              courseTitle: course.title,
              couponCode: discount?.code ?? "",
              originalAmount: discount?.originalAmount.toString() ?? course.amount.toString(),
              discountAmount: discount?.discountAmount.toString() ?? "0",
            },
          }),
        });

        const order = await parseGatewayResponse<{
          id: string;
          amount: number;
          currency: string;
          receipt: string;
        }>(response);

        return reply.status(200).send({
          success: true,
          data: {
            keyId,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            receipt: order.receipt,
            course,
            discount,
          },
        });
      } catch (err) {
        fastify.log.error(err);
        const message = err instanceof Error ? err.message : "Failed to create Razorpay order";
        const status = message === "Course not found" ? 404 : 400;
        return reply.status(status).send({ success: false, message });
      }
    }
  );

  fastify.post(
    "/api/payments/razorpay/verify",
    async (req: FastifyRequest<{ Body: RazorpayVerifyBody }>, reply: FastifyReply) => {
      try {
        await resolveCoursePaymentDetails(req.body.courseSlug);
        const keySecret = getRazorpayKeySecret();
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
          return reply.status(400).send({ success: false, message: "Payment verification data is incomplete" });
        }

        const expectedSignature = crypto
          .createHmac("sha256", keySecret)
          .update(`${razorpay_order_id}|${razorpay_payment_id}`)
          .digest("hex");

        if (expectedSignature !== razorpay_signature) {
          return reply.status(400).send({ success: false, message: "Payment signature verification failed" });
        }

        await markCouponRedeemed(req.body.couponCode);

        return reply.status(200).send({
          success: true,
          message: "Payment verified successfully",
          data: {
            provider: "razorpay",
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
          },
        });
      } catch (err) {
        fastify.log.error(err);
        const message = err instanceof Error ? err.message : "Failed to verify Razorpay payment";
        const status = message === "Course not found" ? 404 : 400;
        return reply.status(status).send({ success: false, message });
      }
    }
  );

  fastify.post(
    "/api/payments/paypal/order",
    async (req: FastifyRequest<{ Body: PayPalOrderBody }>, reply: FastifyReply) => {
      try {
        const baseCourse = await resolveCoursePaymentDetails(req.body.courseSlug);
        const { course, discount } = await applyCouponToCourse(baseCourse, req.body.couponCode);
        const accessToken = await getPayPalAccessToken();
        const response = await fetch(`${getPayPalBaseUrl()}/v2/checkout/orders`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            intent: "CAPTURE",
            purchase_units: [
              {
                reference_id: course.slug,
                custom_id: discount?.code ?? "",
                description: course.title,
                amount: {
                  currency_code: course.currency,
                  value: formatPayPalAmount(course.amount),
                },
              },
            ],
          }),
        });

        const order = await parseGatewayResponse<{ id: string; status: string }>(response);
        return reply.status(200).send({ success: true, data: { id: order.id, status: order.status, course, discount } });
      } catch (err) {
        fastify.log.error(err);
        const message = err instanceof Error ? err.message : "Failed to create PayPal order";
        const status = message === "Course not found" ? 404 : 400;
        return reply.status(status).send({ success: false, message });
      }
    }
  );

  fastify.post(
    "/api/payments/paypal/capture",
    async (req: FastifyRequest<{ Body: PayPalCaptureBody }>, reply: FastifyReply) => {
      try {
        const baseCourse = await resolveCoursePaymentDetails(req.body.courseSlug);
        const { course } = await applyCouponToCourse(baseCourse, req.body.couponCode);
        const { orderID } = req.body;
        if (!orderID) {
          return reply.status(400).send({ success: false, message: "PayPal order ID is required" });
        }

        const accessToken = await getPayPalAccessToken();
        const response = await fetch(`${getPayPalBaseUrl()}/v2/checkout/orders/${orderID}/capture`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });

        const capture = await parseGatewayResponse<{
          id: string;
          status: string;
          purchase_units?: Array<{
            payments?: {
              captures?: Array<{
                id: string;
                status: string;
                amount?: {
                  currency_code: string;
                  value: string;
                };
              }>;
            };
          }>;
        }>(response);

        const paidCapture = capture.purchase_units?.[0]?.payments?.captures?.[0];
        const capturedAmount = paidCapture?.amount;
        const amountMatches =
          capturedAmount?.currency_code === course.currency &&
          capturedAmount.value === formatPayPalAmount(course.amount);

        if (capture.status !== "COMPLETED" || paidCapture?.status !== "COMPLETED" || !amountMatches) {
          return reply.status(400).send({ success: false, message: "PayPal payment capture could not be confirmed" });
        }

        await markCouponRedeemed(req.body.couponCode);

        return reply.status(200).send({
          success: true,
          message: "Payment captured successfully",
          data: {
            provider: "paypal",
            orderId: capture.id,
            captureId: paidCapture.id,
          },
        });
      } catch (err) {
        fastify.log.error(err);
        const message = err instanceof Error ? err.message : "Failed to capture PayPal payment";
        const status = message === "Course not found" ? 404 : 400;
        return reply.status(status).send({ success: false, message });
      }
    }
  );
}
