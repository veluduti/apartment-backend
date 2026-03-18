const express = require("express");
const { PrismaClient } = require("@prisma/client");
const admin = require("../firebase");
const { getService } = require("../services/registry/serviceRegistry");

const router = express.Router();
const prisma = new PrismaClient();


// =================================
// CREATE REQUEST
// =================================
router.post("/", async (req, res) => {
  try {
    console.log("REQUEST BODY:", req.body);
    const {
      apartmentId,
      residentId,
      serviceType,
      details,
      priority,
      flatId
    } = req.body;

    if (!apartmentId || !residentId || !serviceType || !details || !flatId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const flat = await prisma.flat.findUnique({
      where: { id: flatId }
    });

    if (!flat) {
      return res.status(400).json({
        success: false,
        message: "Invalid flat selected",
      });
    }

    const newRequest = await prisma.serviceRequest.create({
      data: {
        apartmentId,
        residentId,
        serviceType,
        details,
        priority: priority || "MEDIUM",
        status: "PENDING",
        flatId,
        flatNumber: flat.number,
        blockId: flat.blockId,
        isEscalated: false
      },
    });

// =============================
// SAVE PLUMBING DETAILS
// =============================
if (serviceType === "PLUMBING") {

  const { photos, problemTitle } = req.body;

  await prisma.plumberDetails.create({
    data: {
      requestId: newRequest.id,
      problemTitle: problemTitle || "Plumbing Issue",
      description: details,
      photos: photos || []
    }
  });

}

    const assignedWorker = await prisma.workerFlat.findUnique({
      where: { flatId },
      include: {
        worker: {
          include: { workerProfile: true }
        }
      }
    });

// =================================
// SERVICE SPECIFIC LOGIC
// =================================

// Run service logic except plumbing
const service = getService(serviceType);

if (service && service.onCreate && serviceType !== "PLUMBING") {
  await service.onCreate(newRequest, req.body);
}

    if (
      assignedWorker &&
      assignedWorker.worker &&
      assignedWorker.worker.workerProfile &&
      assignedWorker.worker.workerProfile.service === serviceType &&
      assignedWorker.worker.fcmToken
    ) {
      try {
        await admin.messaging().send({
          token: assignedWorker.worker.fcmToken,
          notification: {
            title: "New Service Request",
            body: `New ${serviceType} request from Flat ${flat.number}`,
          },
        });
      } catch (err) {
        console.error("Notification error:", err);
      }
    }

    res.json({ success: true, data: newRequest });

  } catch (error) {
    console.error("CREATE ERROR:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// =================================
// GET REQUESTS
// =================================
router.get("/", async (req, res) => {
  try {

    const { apartmentId, role, userId } = req.query;

    if (!apartmentId) {
      return res.status(400).json({
        success: false,
        message: "apartmentId is required",
      });
    }

    let where = { apartmentId };

    if (role === "resident") {
      where = {
        apartmentId,
        residentId: userId,
        isDeletedByResident: false
      };
    }

    if (role === "worker") {

      const worker = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          workerProfile: true,
          assignedFlats: true,
        },
      });
      const service = worker.workerProfile?.service;

      if (!worker) {
        return res.json({ success: true, data: [] });
      }

      // =============================
// IRON SERVICE → ASSIGNED WORKER
// =============================
if (service === "IRON") {

  const assignedFlatIds = worker.assignedFlats.map(f => f.flatId);

  where = {
    apartmentId,
    isDeletedByWorker: false,
    serviceType: "IRON",

    OR: [
      {
        flatId: { in: assignedFlatIds },
        status: "PENDING",
        isEscalated: false
      },
      {
        status: "PENDING",
        isEscalated: true,
        workerId: null,
        NOT: {
          logs: {
            some: {
              changedByUserId: userId,
              newStatus: "REJECTED"
            }
          }
        }
      },
      {
        workerId: userId
      }
    ]
  };

}

// =============================
// PLUMBING → FIRST ACCEPT MODEL
// =============================
else if (service === "PLUMBING") {

  where = {
    apartmentId,
    isDeletedByWorker: false,
    serviceType: "PLUMBING",

    OR: [

      // show all new plumbing requests
      {
        status: "PENDING",
        workerId: null
      },

      // show jobs already accepted by this worker
      {
        workerId: userId
      }

    ]
  };

}
    }

    const requests = await prisma.serviceRequest.findMany({
      where,
      include: {
        resident: true,
        worker: {
          select: {
            id: true,
            name: true,
            phone: true
          }
        },
        pickupSlot: true,
        ironItems: true,
        payment: true,
        plumberDetails: {
          select: {
            problemTitle: true,
            note: true,
            photos: true,
            visitCharge: true,
            materialCharge: true
          }
        },
        
        flat: {
          select: { number: true }
        },
        logs: {
          include: { changedByUser: true },
          orderBy: { changedAt: "asc" }
        }
      },
      orderBy: { createdAt: "desc" },
    });


// ======================================
// 🔥 FILTER ESCALATED BY CAPACITY
// ======================================

    if (role === "worker") {

      const filtered = [];

      for (const reqItem of requests) {

        if (reqItem.workerId === userId) {
          filtered.push(reqItem);
          continue;
        }

        if (!reqItem.isEscalated) {
          filtered.push(reqItem);
          continue;
        }

        if (reqItem.status !== "PENDING") continue;

        if (reqItem.serviceType !== "IRON") {
          filtered.push(reqItem);
          continue;
        }

        if (!reqItem.pickupDate) {
          continue;
        }

        const startOfDay = new Date(reqItem.pickupDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(reqItem.pickupDate);
        endOfDay.setHours(23, 59, 59, 999);

        const capacity = await prisma.workerDailyCapacity.findUnique({
          where: {
            workerId_date: {
              workerId: userId,
              date: startOfDay
            }
          }
        });

        const totalLimit = capacity?.totalLimit ?? 100;

        const acceptedRequests = await prisma.serviceRequest.findMany({
          where: {
            workerId: userId,
            pickupDate: {
              gte: startOfDay,
              lte: endOfDay
            },
            status: {
              in: ["ACCEPTED", "IN_PROGRESS", "COMPLETED"]
            }
          },
          include: { ironItems: true }
        });

        const used = acceptedRequests.reduce((sum, r) => {
          const clothes =
            r.confirmedClothes ??
            r.requestedClothes ??
            r.ironItems.reduce((s, item) => s + item.quantity, 0);

          return sum + clothes;
        }, 0);

        const requestedClothes =
          reqItem.confirmedClothes ??
          reqItem.requestedClothes ??
          reqItem.ironItems.reduce((s, item) => s + item.quantity, 0);

        if (used + requestedClothes <= totalLimit) {
          filtered.push(reqItem);
        }

      }

      return res.json({ success: true, data: filtered });
    }

    res.json({ success: true, data: requests });

  } catch (error) {
    console.error("GET ERROR:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// =================================
// UPDATE STATUS
// =================================
router.post("/status", async (req, res) => {
  try {

    const { requestId, status, reason, userId } = req.body;

    const existing = await prisma.serviceRequest.findUnique({
      where: { id: requestId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // =========================
    // 🔴 REJECT → ESCALATE
    // =========================
    if (status === "REJECTED") {

      await prisma.$transaction(async (tx) => {

        await tx.requestStatusLog.create({
          data: {
            requestId,
            oldStatus: existing.status,
            newStatus: "REJECTED",
            changedByUserId: userId,
            note: reason
          }
        });

        await tx.serviceRequest.update({
          where: { id: requestId },
          data: {
            status: "PENDING",
            isEscalated: true,
            workerId: null,
          }
        });

      });

      return res.json({
        success: true,
        message: "Request escalated to other workers"
      });
    }

    // =========================
    // 🟢 ACCEPT
    // =========================
    if (status === "ACCEPTED") {

  const request = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    include: { ironItems: true }
  });

  if (!request) {
    return res.json({ success: false, message: "Request not found" });
  }

  // 🔥 Capacity check ONLY for iron service
  if (request.serviceType === "IRON") {

    const pickupDate = request.pickupDate;

    if (!pickupDate) {
      return res.json({
        success: false,
        message: "Pickup date missing"
      });
    }

    const startOfDay = new Date(pickupDate);
    startOfDay.setHours(0,0,0,0);

    const endOfDay = new Date(pickupDate);
    endOfDay.setHours(23,59,59,999);

    const capacity = await prisma.workerDailyCapacity.findFirst({
      where: {
        workerId: userId,
        date: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });

    const totalLimit = capacity?.totalLimit ?? 100;

    const acceptedRequests = await prisma.serviceRequest.findMany({
      where: {
        workerId: userId,
        pickupDate: {
          gte: startOfDay,
          lte: endOfDay
        },
        status: {
          in: ["ACCEPTED","IN_PROGRESS","COMPLETED"]
        }
      },
      include: { ironItems: true }
    });

    const used = acceptedRequests.reduce((sum, r) => {

      const clothes =
        r.confirmedClothes ??
        r.requestedClothes ??
        r.ironItems.reduce((s,i)=>s+i.quantity,0);

      return sum + clothes;

    },0);

    const requestedClothes =
      request.confirmedClothes ??
      request.requestedClothes ??
      request.ironItems.reduce((s,i)=>s+i.quantity,0);

    if (used + requestedClothes > totalLimit) {
      return res.json({
        success:false,
        type:"CAPACITY_EXCEEDED",
        message:"Daily capacity exceeded"
      });
    }

  }

  const updated = await prisma.serviceRequest.updateMany({
    where: {
      id: requestId,
      status: "PENDING"
    },
    data: {
      status: "ACCEPTED",
      workerId: userId
    }
  });

  if (updated.count === 0) {
    return res.json({
      success:false,
      message:"Already accepted"
    });
  }

  await prisma.requestStatusLog.create({
    data:{
      requestId,
      oldStatus:"PENDING",
      newStatus:"ACCEPTED",
      changedByUserId:userId
    }
  });

  await prisma.payment.upsert({
    where:{ requestId },
    update:{},
    create:{
      requestId,
      residentId: request.residentId,
      workerId:userId,
      amount: request.totalAmount,
      status:"PENDING"
    }
  });

  return res.json({ success:true });

}

    // =========================
    // 🟣 OTHER STATUS
    // =========================
    await prisma.$transaction(async (tx) => {

      if (status === "IN_PROGRESS") {

        const { confirmedClothes } = req.body;

        const request = await tx.serviceRequest.findUnique({
          where: { id: requestId },
          include: { ironItems: true }
        });

        if (!request) {
          throw new Error("Request not found");
        }

        const requestedClothes = request.ironItems.reduce(
          (sum, item) => sum + item.quantity,
          0
        );

        if (
          confirmedClothes != null &&
          confirmedClothes !== requestedClothes
        ) {
          throw new Error("CLOTHES_MISMATCH");
        }

        await tx.requestStatusLog.create({
          data: {
            requestId,
            oldStatus: existing.status,
            newStatus: "IN_PROGRESS",
            changedByUserId: userId
          }
        });

        await tx.serviceRequest.update({
          where: { id: requestId },
          data: {
            status: "IN_PROGRESS",
            confirmedClothes: confirmedClothes ?? null,
            totalAmount: request.totalAmount
          }
        });

        return;
      }

      await tx.requestStatusLog.create({
        data: {
          requestId,
          oldStatus: existing.status,
          newStatus: status,
          changedByUserId: userId
        }
      });

      await tx.serviceRequest.update({
        where: { id: requestId },
        data: { status }
      });

    });

    res.json({ success: true });

  } catch (error) {
    if (error.message === "CLOTHES_MISMATCH") {
      return res.json({
        success: false,
        message: "Clothes count mismatch. Please verify with resident."
      });
    }
    console.error("UPDATE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});


// =================================
// HIDE
// =================================
router.post("/hide", async (req, res) => {
  try {

    const { requestId, role } = req.body;

    let updateData = {};

    if (role === "resident") {
      updateData.isDeletedByResident = true;
    }

    if (role === "worker") {
      updateData.isDeletedByWorker = true;
    }

    await prisma.serviceRequest.update({
      where: { id: requestId },
      data: updateData,
    });

    res.json({ success: true });

  } catch (error) {
    console.error("HIDE ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});


// =================================
// SAVE FCM TOKEN
// =================================
router.post("/save-token", async (req, res) => {
  try {

    const { userId, token } = req.body;

    await prisma.user.update({
      where: { id: userId },
      data: { fcmToken: token },
    });

    res.json({
      success: true,
      message: "Token saved successfully",
    });

  } catch (error) {
    console.error("TOKEN SAVE ERROR:", error);
    res.json({
      success: false,
      message: "Failed to save token",
    });
  }
});

module.exports = router;