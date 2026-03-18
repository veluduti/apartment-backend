const express = require("express");
const prisma = require("../data/db");
const { assignPlumber } = require("../services/plumbing/plumbingAssignmentService");

const router = express.Router();

/* ================================
   STATUS TRANSITION RULES
================================ */

const allowedTransitions = {
  PENDING: ["ACCEPTED"],
  ACCEPTED: ["VISITED"],
  VISITED: ["QUOTED"],
  QUOTED: ["CONFIRMED", "REJECTED"],
  CONFIRMED: [],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  REJECTED: []
};

/* ================================
   HELPER: Validate Transition
================================ */
function validateTransition(current, next) {
  return allowedTransitions[current]?.includes(next);
}

router.post("/start-work", async (req, res) => {
  try {

    const { requestId, userId } = req.body;

    const payment = await prisma.payment.findUnique({
      where: { requestId }
    });

    if (!payment || payment.status !== "PAID") {
      return res.json({
        success: false,
        message: "Payment not completed"
      });
    }

    await prisma.serviceRequest.update({
      where: { id: requestId },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date()
      }
    });

    const io = req.app.get("io");
    io.emit("requestUpdated", { requestId });

    res.json({ success: true });

  } catch (err) {
    console.error("START WORK ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================================
   ACCEPT
================================ */
router.post("/accept", async (req, res) => {
  try {
    const { requestId, userId } = req.body;

    const request = await prisma.serviceRequest.findUnique({
      where: { id: requestId }
    });

    if (!request || request.serviceType !== "PLUMBING")
      return res.status(400).json({ success: false });

    const worker = await prisma.user.findUnique({
      where: { id: userId },
      include: { workerProfile: true }
    });
    
    if (!worker || worker.workerProfile?.service !== "PLUMBING") {
      return res.status(403).json({
        success: false,
        message: "Only plumbers can accept plumbing jobs"
      });
    }

    if (!validateTransition(request.status, "ACCEPTED"))
      return res.status(400).json({
        success: false,
        message: `Invalid transition from ${request.status} to ACCEPTED`
      });

    const updated = await prisma.serviceRequest.updateMany({
      where: {
        id: requestId,
        status: "PENDING"
      },
      data: {
        status: "ACCEPTED",
        workerId: userId,
        acceptedAt: new Date()
      }
    });

    if (updated.count === 0)
      return res.json({ success: false, message: "Already accepted" });

    await prisma.requestStatusLog.create({
      data: {
        requestId,
        oldStatus: request.status,
        newStatus: "ACCEPTED",
        changedByUserId: userId
      }
    });
    const io = req.app.get("io");
    io.emit("requestUpdated", { requestId });

    res.json({ success: true });

  } catch (err) {
    console.error("ACCEPT ERROR:", err);
    res.status(500).json({ success: false });
  }
});


/* ================================
   REJECT → REASSIGN
================================ */
router.post("/reject", async (req, res) => {
  try {
    const { requestId, userId, reason } = req.body;

    const request = await prisma.serviceRequest.findUnique({
      where: { id: requestId }
    });

    if (!request || request.serviceType !== "PLUMBING")
      return res.status(400).json({ success: false });

    if (request.workerId !== userId)
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this job"
      });

    if (!validateTransition(request.status, "CANCELLED"))
      return res.status(400).json({
        success: false,
        message: `Invalid transition from ${request.status} to REJECTED`
      });

    await prisma.$transaction(async (tx) => {

      await tx.requestStatusLog.create({
        data: {
          requestId,
          oldStatus: request.status,
          newStatus: "CANCELLED",
          changedByUserId: userId,
          note: reason
        }
      });

      await tx.serviceRequest.update({
        where: { id: requestId },
        data: {
          status: "PENDING",
          workerId: null
        }
      });

    });

    await assignPlumber(request.apartmentId, requestId, userId);
    const io = req.app.get("io");
    io.emit("requestUpdated", { requestId });

    res.json({ success: true });

  } catch (err) {
    console.error("REJECT ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================================
   VISITED
================================ */
router.post("/visited", async (req, res) => {
  try {
    const { requestId, userId } = req.body;

    const request = await prisma.serviceRequest.findUnique({
      where: { id: requestId }
    });

    if (!request || request.serviceType !== "PLUMBING")
      return res.status(400).json({ success: false });

    if (request.workerId !== userId)
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this job"
      });

    if (!validateTransition(request.status, "VISITED"))
      return res.status(400).json({
        success: false,
        message: `Invalid transition from ${request.status} to VISITED`
      });

    await prisma.serviceRequest.update({
      where: { id: requestId },
      data: { 
        status: "VISITED",
        visitedAt: new Date()
    }
    });

    const io = req.app.get("io");
    io.emit("requestUpdated", { requestId });

    await prisma.requestStatusLog.create({
      data: {
        requestId,
        oldStatus: request.status,
        newStatus: "VISITED",
        changedByUserId: userId
      }
    });

    res.json({ success: true });

  } catch (err) {
    console.error("VISITED ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================================
   QUOTE
================================ */
router.post("/quote", async (req, res) => {
  try {
    const { requestId, visitCharge, materialCharge, note, userId } = req.body;

    const v = Number(visitCharge);
    const m = Number(materialCharge);

    if (isNaN(v) || isNaN(m) || v + m <= 0) {
      return res.status(400).json({
        success: false,
        message: "Total amount must be greater than ₹0"
      });
    }

    const finalAmount = v + m;

    console.log("QUOTE AMOUNT:", {
      visitCharge: v,
      materialCharge: m,
      finalAmount
    });

    const request = await prisma.serviceRequest.findUnique({
      where: { id: requestId }
    });

    if (request.status === "QUOTED") {
      return res.json({
        success: false,
        message: "Quote already sent"
      });
    }

    if (!request || request.serviceType !== "PLUMBING")
      return res.status(400).json({ success: false });

    if (request.workerId !== userId)
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this job"
      });

    if (!validateTransition(request.status, "QUOTED"))
      return res.status(400).json({
        success: false,
        message: `Invalid transition from ${request.status} to QUOTED`
      });

    await prisma.$transaction(async (tx) => {

      await tx.plumberDetails.upsert({
  where: { requestId },
  update: {
    visitCharge,
    materialCharge,
    finalAmount,
    note
  },
  create: {
    requestId,
    visitCharge,
    materialCharge,
    finalAmount,
    note,
    description: request.details,
    problemTitle: "Plumbing Work"
  }
});

      await tx.serviceRequest.update({
        where: { id: requestId },
        data: {
          status: "QUOTED",
          quotedAt: new Date(),
          totalAmount: finalAmount,
        }
      });
      const io = req.app.get("io");
      io.emit("requestUpdated", { requestId });

      await tx.notification.create({
  data: {
    userId: request.residentId,
    title: "Plumber Submitted Quote",
    body: "Please review and approve the repair estimate",
    referenceId: requestId,
    type: "REQUEST"
  }
});

console.log("Saving payment amount:", finalAmount);

await tx.payment.upsert({
  where: { requestId },
  update: {
    amount: finalAmount,
    status: "PENDING"
  },
  create: {
    requestId,
    residentId: request.residentId,
    workerId: request.workerId,
    amount: finalAmount,
    status: "PENDING"
  }
});

    });

    res.json({ success: true });

  } catch (err) {
    console.error("QUOTE ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================================
   APPROVE (Resident)
================================ */
router.post("/approve", async (req, res) => {
  try {
    const { requestId, approved, reason } = req.body;

    const request = await prisma.serviceRequest.findUnique({
      where: { id: requestId }
    });

    if (!request || request.serviceType !== "PLUMBING")
      return res.status(400).json({ success: false });
    
    const nextStatus = approved ? "CONFIRMED" : "REJECTED";

    if (!validateTransition(request.status, nextStatus))
      return res.status(400).json({
        success: false,
        message: `Invalid transition from ${request.status} to ${nextStatus}`
      });

    await prisma.$transaction(async (tx) => {

  if (approved) {
    await tx.plumberDetails.update({
      where: { requestId },
      data: { residentApproved: true }
    });
  }

  await tx.serviceRequest.update({
  where: { id: requestId },
  data: {
    status: nextStatus,
    reason: approved ? null : reason,
    ...(approved ? { startedAt: new Date() } : {})
  }
});

  const io = req.app.get("io");
  io.emit("requestUpdated", { requestId });
  

});

  await prisma.requestStatusLog.create({
  data: {
    requestId,
    oldStatus: request.status,
    newStatus: nextStatus,
    changedByUserId: request.residentId,
    note: reason || null
  }
});

    res.json({ success: true });

  } catch (err) {
    console.error("APPROVE ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================================
   COMPLETE
================================ */
router.post("/complete", async (req, res) => {
  try {
    const { requestId, userId } = req.body;

    const request = await prisma.serviceRequest.findUnique({
      where: { id: requestId }
    });

    const worker = await prisma.user.findUnique({
  where: { id: userId },
  include: { workerProfile: true }
});

if (!worker || worker.workerProfile?.service !== "PLUMBING") {
  return res.status(403).json({
    success: false,
    message: "Only plumbers can accept plumbing jobs"
  });
}

    if (!request || request.serviceType !== "PLUMBING")
      return res.status(400).json({ success: false });

    if (request.workerId !== userId)
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this job"
      });

    if (!validateTransition(request.status, "COMPLETED"))
      return res.status(400).json({
        success: false,
        message: `Invalid transition from ${request.status} to COMPLETED`
      });

    await prisma.serviceRequest.update({
      where: { id: requestId },
      data: { 
        status: "COMPLETED",
        completedAt: new Date()
    }
    });
    const io = req.app.get("io");
    io.emit("requestUpdated", { requestId });
  
    

    await prisma.requestStatusLog.create({
      data: {
        requestId,
        oldStatus: request.status,
        newStatus: "COMPLETED",
        changedByUserId: userId
      }
    });

    res.json({ success: true });

  } catch (err) {
    console.error("COMPLETE ERROR:", err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;