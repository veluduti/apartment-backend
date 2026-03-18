const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// =================================
// CREATE ORDER
// =================================
router.post("/create-order", async (req, res) => {
  try {

    const { requestId } = req.body;

    if (!requestId) {
      return res.json({
        success: false,
        message: "Invalid request"
      });
    }

    const payment = await prisma.payment.findUnique({
      where: { requestId }
    });

    if (!payment) {
      return res.json({
        success: false,
        message: "Payment not found"
      });
    }

    // 🔹 Fetch service request
    const request = await prisma.serviceRequest.findUnique({
      where: { id: requestId }
    });

    // 🔥 Correct amount logic
    const amount = Math.max(
      Number(payment.amount || request?.totalAmount || 0),
      1
    );

    console.log("PAYMENT AMOUNT USED:", amount);

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: requestId,
    });

    res.json({
      success: true,
      orderId: order.id,
      amount: amount,
    });

  } catch (err) {

    console.error("CREATE ORDER ERROR:", err);

    res.json({
      success: false,
      message: "Order creation failed"
    });

  }
});

// =================================
// VERIFY PAYMENT
// =================================
router.post("/verify", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      requestId
    } = req.body;

    const payment = await prisma.payment.findUnique({
      where: { requestId },
      include: { request: true }
    });

    if (!payment || payment.status === "PAID") {
      return res.json({ success: false });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.json({ success: false });
    }

    const updated = await prisma.payment.update({
      where: { requestId },
      data: {
        status: "PAID",
        amount: payment.request.totalAmount,
        razorpayPaymentId: razorpay_payment_id,
        paidAt: new Date()
      }
    });

    await prisma.serviceRequest.update({
      where: { id: requestId },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date()
      }
    });
    
    // 🔥 REAL-TIME NOTIFY WORKER
const io = req.app.get("io");

// Get service request to fetch workerId
const serviceRequest = await prisma.serviceRequest.findUnique({
  where: { id: requestId }
});

if (serviceRequest && serviceRequest.workerId) {
  io.to(serviceRequest.workerId).emit("paymentReceived", {
    requestId,
    amount: updated.amount
  });

  console.log("✅ Payment event emitted to worker:", serviceRequest.workerId);
}

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// =================================
// GET WORKER PAYMENT HISTORY
// =================================
router.get("/worker/:workerId", async (req, res) => {
  try {
    const { workerId } = req.params;

    const payments = await prisma.payment.findMany({
      where: {
        workerId: workerId,
        status: "PAID"
      },
      
      include: {
        request: {
          include: {
            pickupSlot: true,
            resident: true,
            flat: true,
          },
        },
      },

      orderBy: {
        paidAt: "desc",
      },
    });

    // Calculate today's earnings
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayPayments = payments.filter(
      (p) =>
        p.status === "PAID" &&
        p.paidAt &&
        p.paidAt >= today &&
        p.paidAt < tomorrow
    );

    const todayTotal = todayPayments.reduce(
      (sum, p) => sum + p.amount,
      0
    );

    res.json({
      success: true,
      todayTotal,
      payments,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;