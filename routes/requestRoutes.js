const { addIronItems } = require("../controllers/requestController");
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const admin = require("../firebase");
const { getService } = require("../services/registry/serviceRegistry");

const router = express.Router();
const prisma = new PrismaClient();

function canEditRequest(request) {

  // ✅ Status check
  if (!["PENDING", "ACCEPTED"].includes(request.status)) {
    return false;
  }

  // ✅ Slot must exist
  if (!request.pickupSlot || !request.pickupSlot.startTime) {
    return false;
  }

  const now = new Date();
  const slotStart = new Date(request.pickupSlot.startTime);

  // ⏱️ 30 minutes before slot
  const cutoff = new Date(slotStart.getTime() - 30 * 60 * 1000);

  return now < cutoff;
}

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

// =============================
// WORKER LOGIC
// =============================
let worker = null;

if (role === "worker") {

  worker = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      workerProfile: true,
      assignedFlats: true
    }
  });

  if (!worker || worker.role !== "WORKER") {
    return res.json({
      success: true,
      data: [],
      edits: []
    });
  }

  const service = worker.workerProfile?.service;

if (!service) {
  return res.json({
    success: true,
    data: [],
    edits: []
  });
}

  // =============================
  // IRON SERVICE → ASSIGNED WORKER
  // =============================
  if (service === "IRON") {

    const assignedFlatIds = (worker.assignedFlats || []).map(f => f.flatId);

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
        {
          status: "PENDING",
          workerId: null
        },
        {
          workerId: userId
        }
      ]
    };
  }
}

// =============================
// FETCH REQUESTS
// =============================
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

        // Only show assigned flats if NOT escalated
    if (!reqItem.isEscalated) {
      if (
        reqItem.flatId &&
        (worker.assignedFlats || []).some(f => f.flatId === reqItem.flatId)
      ) {
        filtered.push(reqItem);
      }
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

      const edits = await prisma.requestEdit.findMany({
        where: {
          status: "PENDING",
          OR: [
            {
              request: {
                workerId: userId
              }
            },
            {
              request: {
                workerId: null,
                serviceType: "IRON"
              }
            }
          ]
        },
        include: {
          request: true
        }
      });

      return res.json({
        success: true,
        data: filtered,
        edits
      });
    }

    const enriched = requests.map(r => ({
      ...r,
      canEdit: canEditRequest(r)
    }));

    res.json({ success: true, data: enriched });

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

router.put("/:requestId/add-items", addIronItems);

router.post("/edit-items", async (req, res) => {
  try {
    const { requestId, items } = req.body;

    if (!items || items.length === 0) {
      return res.json({ success: false, message: "No items" });
    }

    // 🚫 prevent multiple pending edits
    const existing = await prisma.requestEdit.findFirst({
      where: {
        requestId,
        status: "PENDING"
      }
    });

    if (existing) {
      return res.json({
        success: false,
        message: "Already pending approval"
      });
    }

    // ✅ create edit request
    const edit = await prisma.requestEdit.create({
      data: {
        requestId,
        items,
        status: "PENDING"
      }
    });

    // 🔔 notify worker
    const request = await prisma.serviceRequest.findUnique({
      where: { id: requestId },
      include: { worker: true }
    });

    if (request?.worker?.fcmToken) {
      await admin.messaging().send({
        token: request.worker.fcmToken,
        notification: {
          title: "Edit Request",
          body: "Resident updated clothes. Please review."
        }
      });
    }

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// =================================
// APPROVE EDIT
// =================================
router.post("/edit/approve", async (req, res) => {
  try {
    const io = req.app.get("io"); // ✅ HERE
    const { editId, userId } = req.body;

    const edit = await prisma.requestEdit.findUnique({
      where: { id: editId },
      include: { request: true }
    });

    // ✅ SECURITY CHECK
    if (!edit || edit.request.workerId !== userId) {
      return res.json({ success: false, message: "Unauthorized" });
    }

    // 🔥 APPLY ITEMS
    await addIronItemsLogic(edit.requestId, edit.items);

    await prisma.requestEdit.update({
      where: { id: editId },
      data: { status: "APPROVED" }
    });

    io.emit("editResponse", {
      requestId: edit.requestId,
      residentId: edit.request.residentId,
      approved: true
    });

    // 🔥🔥 ADD THIS LINE HERE
    io.emit("requestUpdated", {
      requestId: edit.requestId
    });

    // ===============================
    // 🔔 NOTIFY RESIDENT (ADD HERE)
    // ===============================
    const request = await prisma.serviceRequest.findUnique({
      where: { id: edit.requestId },
      include: { resident: true }
    });

    if (request?.resident?.fcmToken) {
      await admin.messaging().send({
        token: request.resident.fcmToken,
        notification: {
          title: "Edit Approved",
          body: "Your updated clothes have been approved"
        }
      });
    }

    // ===============================
    // RESPONSE
    // ===============================
    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// =================================
// REJECT EDIT
// =================================
router.post("/edit/reject", async (req, res) => {
  try {
    const { editId, userId } = req.body;

    const edit = await prisma.requestEdit.findUnique({
      where: { id: editId },
      include: { request: true }
    });

    if (!edit || edit.request.workerId !== userId) {
      return res.json({ success: false, message: "Unauthorized" });
    }

    // ✅ Update status
    await prisma.requestEdit.update({
      where: { id: editId },
      data: { status: "REJECTED" }
    });

    io.emit("editResponse", {
      requestId: edit.requestId,
      residentId: edit.request.residentId,
      approved: false
    });

    // 🔥🔥 ADD THIS LINE HERE
    io.emit("requestUpdated", {
      requestId: edit.requestId
    });

    // ===============================
    // 🔔 NOTIFY RESIDENT (MOVE HERE)
    // ===============================
    const request = await prisma.serviceRequest.findUnique({
      where: { id: edit.requestId },
      include: { resident: true }
    });

    if (request?.resident?.fcmToken) {
      await admin.messaging().send({
        token: request.resident.fcmToken,
        notification: {
          title: "Edit Rejected",
          body: "Worker rejected your changes"
        }
      });
    }

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

async function addIronItemsLogic(requestId, items) {

  const request = await prisma.serviceRequest.findUnique({
    where: { id: requestId }
  });

  const pricing = await prisma.ironPricing.findMany({
    where: { apartmentId: request.apartmentId }
  });

  const priceMap = {};
  pricing.forEach(p => {
    priceMap[p.clothType] = p.price;
  });

  // delete old
  await prisma.ironItem.deleteMany({
    where: { requestId }
  });

  let totalAmount = 0;
  let totalClothes = 0;

  const itemsToSave = items.map(item => {
    const price = priceMap[item.clothType] ?? 0;

    totalAmount += item.quantity * price;
    totalClothes += item.quantity;

    return {
      requestId,
      clothType: item.clothType,
      quantity: item.quantity,
      pricePerUnit: price
    };
  });

  await prisma.ironItem.createMany({
    data: itemsToSave
  });

  await prisma.serviceRequest.update({
    where: { id: requestId },
    data: {
      totalAmount,
      requestedClothes: totalClothes
    }
  });
}

module.exports = router;