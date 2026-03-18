const express = require("express");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();


// =======================================
// WORKER SET DAILY CAPACITY
// =======================================

router.post("/set-capacity", async (req, res) => {
  try {

    const { workerId, totalLimit, date } = req.body;

    if (!workerId || !totalLimit) {
      return res.status(400).json({
        success: false,
        message: "workerId and totalLimit required"
      });
    }

    const selectedDate = date ? new Date(date) : new Date();
    selectedDate.setHours(0, 0, 0, 0);

    // 🔥 UPSERT capacity (create or update)
    await prisma.workerDailyCapacity.upsert({
      where: {
        workerId_date: {
          workerId,
          date: selectedDate
        }
      },
      update: {
        totalLimit
      },
      create: {
        workerId,
        date: selectedDate,
        totalLimit
      }
    });

    // 🔥 DELETE old slots for that date

    await prisma.pickupSlot.updateMany({
      where: {
        workerId,
        date: selectedDate
      },
      data: {
        isActive: false
      }
    });

    // 🔥 REGENERATE slots with new limit
    await generateSlots(workerId, totalLimit, selectedDate);

    res.json({
      success: true,
      message: "Capacity updated & slots regenerated"
    });

  } catch (error) {
    console.error("SET CAPACITY ERROR:", error);
    res.status(500).json({ success: false });
  }
});

// =======================================
// GET AVAILABLE SLOTS FOR RESIDENT
// =======================================
router.get("/available", async (req, res) => {

  try {

    const { apartmentId, flatId, date } = req.query;

    if (!apartmentId || !flatId || !date) {
      return res.status(400).json({
        success: false,
        message: "apartmentId, flatId and date required"
      });
    }

    const selectedDate = new Date(date);
    selectedDate.setHours(0,0,0,0);

    const assignment = await prisma.workerFlat.findUnique({
      where: { flatId }
    });

    if (!assignment) {
      return res.json({
        success: false,
        message: "No worker assigned to this flat"
      });
    }

    const workerId = assignment.workerId;

    // 🔥 CHECK DAILY CAPACITY
let capacity = await prisma.workerDailyCapacity.findUnique({
  where: {
    workerId_date: {
      workerId,
      date: selectedDate
    }
  }
});

// 🔥 If no capacity → create default 100
if (!capacity) {

  capacity = await prisma.workerDailyCapacity.create({
    data: {
      workerId,
      date: selectedDate,
      totalLimit: 100
    }
  });

}

// 🔥 Check if slots exist for that date
const existingSlots = await prisma.pickupSlot.count({
  where: {
    workerId,
    date: selectedDate,
    isActive: true
  }
});

// 🔥 If no slots exist → generate them
if (existingSlots === 0) {
  await generateSlots(workerId, capacity.totalLimit, selectedDate);
}

// 🔹 Create time helpers
const now = new Date();

const startOfDay = new Date(selectedDate);
startOfDay.setHours(0, 0, 0, 0);

const endOfDay = new Date(selectedDate);
endOfDay.setHours(23, 59, 59, 999);

// 🔹 Check if selected date is today
const isToday =
  startOfDay.toDateString() === now.toDateString();

// 🔹 Base filter
let slotFilter = {
  workerId,
  apartmentId,
  date: {
    gte: startOfDay,
    lte: endOfDay
  },
  isActive: true
};

// 🔹 Hide expired slots ONLY if date is today
if (isToday) {
  slotFilter.endTime = {
    gt: now
  };
}

const slots = await prisma.pickupSlot.findMany({
  where: slotFilter,
  orderBy: { startTime: "asc" }
});

   const formatted = slots
  .filter(slot => slot.usedCapacity < slot.maxCapacity)
  .map(slot => ({
    id: slot.id,
    type: slot.type,
    startTime: slot.startTime,
    endTime: slot.endTime,
    maxCapacity: slot.maxCapacity,
    usedCapacity: slot.usedCapacity,
    remaining: slot.maxCapacity - slot.usedCapacity
  }));

    res.json({
      success: true,
      data: formatted
    });

  } catch (error) {
    console.error("AVAILABLE SLOT ERROR:", error);
    res.status(500).json({ success: false });
  }
});


// =======================================
// AUTO SLOT GENERATOR FUNCTION
// =======================================

async function generateSlots(workerId, totalLimit, date) {

  const selectedDate = new Date(date);
  selectedDate.setHours(0, 0, 0, 0);
  await prisma.pickupSlot.deleteMany({
  where:{
    workerId,
    date:selectedDate
  }
});

  const worker = await prisma.user.findUnique({
    where: { id: workerId }
  });

  if (!worker) return;

  const apartmentId = worker.apartmentId;

  // 🔥 Slot distribution
  const urgentLimit = Math.floor(totalLimit * 0.15);
  const morningLimit = Math.floor(totalLimit * 0.60);
  const eveningLimit = totalLimit - urgentLimit - morningLimit;

  const slots = [
    { type: "NORMAL", startHour: 8, endHour: 12, capacity: morningLimit },
    { type: "URGENT", startHour: 12, endHour: 14, capacity: urgentLimit },
    { type: "NORMAL", startHour: 16, endHour: 20, capacity: eveningLimit }
  ];

  for (let slot of slots) {

    const start = new Date(selectedDate);
    start.setHours(slot.startHour, 0, 0, 0);

    const end = new Date(selectedDate);
    end.setHours(slot.endHour, 0, 0, 0);

    await prisma.pickupSlot.create({
      data: {
        workerId,
        apartmentId,
        date: selectedDate,
        startTime: start,
        endTime: end,
        type: slot.type,
        maxCapacity: slot.capacity
      }
    });
  }
}

// =======================================
// BOOK SLOT (IRON ONLY) — UPDATED WITH ESCALATION
// =======================================
router.post("/book", async (req, res) => {
  try {

    const {
      slotId,
      residentId,
      apartmentId,
      flatId,
      bagColor,
      items,
      isEscalated
    } = req.body;

    if (!slotId || !residentId || !apartmentId || !flatId) {
      return res.json({ success: false, message: "Missing fields" });
    }

    const slot = await prisma.pickupSlot.findUnique({
      where: { id: slotId }
    });

    if (!slot) {
      return res.json({ success: false, message: "Invalid slot" });
    }

    let totalClothes = 0;
    let totalAmount = 0;
    let details = "";

    // 🔥 Only calculate clothes if NOT escalated
    if (!items || items.length === 0) {
  return res.json({ success: false, message: "No items selected" });
}

for (let item of items) {

  const pricing = await prisma.ironPricing.findUnique({
    where: {
      apartmentId_clothType: {
        apartmentId,
        clothType: item.clothType
      }
    }
  });

  if (!pricing) {
    return res.json({
      success: false,
      message: `Pricing not set for ${item.clothType}`
    });
  }

  totalClothes += item.quantity;
  totalAmount += item.quantity * pricing.price;
}

details = items
  .map(item => `${item.clothType} x${item.quantity}`)
  .join(", ");

  if (!isEscalated && slot.usedCapacity + totalClothes > slot.maxCapacity) {
  return res.json({
    success: false,
    type: "CAPACITY_FULL",
    message: "Primary worker slot capacity exceeded"
  });
}

// ==========================================
// 🔥 SMART WORKER ASSIGNMENT (ESCALATION)
// ==========================================

let assignedWorkerId = slot.workerId;

if (isEscalated) {

  // 🔹 Find other active IRON workers
  const otherWorkers = await prisma.user.findMany({
    where: {
      apartmentId,
      role: "WORKER",
      isActive: true,
      id: { not: slot.workerId }, // exclude primary
      workerProfile: {
        is: {
          service: "IRON",
          isActive: true,
          isAvailable: true
        }
      }
    }
  });

  let found = false;

  for (const worker of otherWorkers) {

    // 🔹 Find same type slot (NORMAL / URGENT)
    const workerSlot = await prisma.pickupSlot.findFirst({
      where: {
        workerId: worker.id,
        date: slot.date,
        type: slot.type,
        isActive: true
      }
    });

    if (!workerSlot) continue;

    const remaining =
      workerSlot.maxCapacity - workerSlot.usedCapacity;

    if (remaining >= totalClothes) {
      assignedWorkerId = worker.id;
      found = true;
      break;
    }
  }

  if (!found) {
    return res.json({
      success: false,
      message: "No worker available with sufficient capacity"
    });
  }
}

await prisma.$transaction(async (tx) => {

  const newRequest = await tx.serviceRequest.create({
    data: {
      apartmentId,
      residentId,
      flatId,
      workerId: assignedWorkerId,
      serviceType: "IRON",
      status: "PENDING",
      details,
      pickupSlotId: slot.id,
      pickupDate: slot.date,
      bagColor,
      requestedClothes: totalClothes,
      totalAmount,
      isEscalated: isEscalated ? true : false
    }
  });

  // 🔥 ALWAYS create iron items
  for (let item of items) {

    const pricing = await tx.ironPricing.findUnique({
      where: {
        apartmentId_clothType: {
          apartmentId,
          clothType: item.clothType
        }
      }
    });

    await tx.ironItem.create({
      data: {
        requestId: newRequest.id,
        clothType: item.clothType,
        quantity: item.quantity,
        pricePerUnit: pricing.price
      }
    });
  }
  
  // 🔥 Deduct capacity from the ASSIGNED worker slot
const assignedSlot = await tx.pickupSlot.findFirst({
  where: {
    workerId: assignedWorkerId,
    date: slot.date,
    type: slot.type,
    isActive: true
  }
});

if (assignedSlot) {
  await tx.pickupSlot.update({
    where: { id: assignedSlot.id },
    data: {
      usedCapacity: {
        increment: totalClothes
      }
    }
  });
}

});

    res.json({
      success: true,
      message: isEscalated
        ? "Request sent to other workers"
        : "Booking confirmed"
    });

  } catch (error) {
    console.error("BOOK SLOT ERROR:", error);
    res.json({ success: false, message: "Server error" });
  }
});

// =======================================
// FIND NEXT AVAILABLE SLOT
// =======================================
router.get("/next-available", async (req, res) => {

  try {

    const { flatId, apartmentId } = req.query;

    if (!flatId || !apartmentId) {
      return res.status(400).json({
        success: false,
        message: "flatId and apartmentId required"
      });
    }

    // 🔹 Find assigned worker
    const assignment = await prisma.workerFlat.findUnique({
      where: { flatId }
    });

    if (!assignment) {
      return res.json({
        success: false,
        message: "No worker assigned"
      });
    }

    const workerId = assignment.workerId;

    const today = new Date();
    today.setHours(0,0,0,0);

    // 🔹 Check next 7 days
    for (let i = 1; i <= 7; i++) {

      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + i);

      const slots = await prisma.pickupSlot.findMany({
        where: {
          workerId,
          apartmentId,
          date: checkDate,
          isActive: true
        },
        orderBy: { startTime: "asc" }
      });

      const available = slots.filter(slot =>
        slot.usedCapacity < slot.maxCapacity
      );

      if (available.length > 0) {
        return res.json({
          success: true,
          date: checkDate,
          slots: available.map(slot => ({
            id: slot.id,
            type: slot.type,
            startTime: slot.startTime,
            endTime: slot.endTime,
            remaining: slot.maxCapacity - slot.usedCapacity
          }))
        });
      }
    }

    return res.json({
      success: false,
      message: "No available slots in next 7 days"
    });

  } catch (error) {
    console.error("NEXT AVAILABLE ERROR:", error);
    res.status(500).json({ success: false });
  }
});

// =======================================
// GET OTHER AVAILABLE WORKERS (IRON)
// =======================================
router.get("/other-workers", async (req, res) => {

  try {

    const { flatId, apartmentId } = req.query;

    if (!flatId || !apartmentId) {
      return res.status(400).json({
        success: false,
        message: "flatId and apartmentId required"
      });
    }

    // 🔹 Find primary worker
    const assignment = await prisma.workerFlat.findUnique({
      where: { flatId }
    });

    if (!assignment) {
      return res.json({
        success: false,
        message: "No primary worker assigned"
      });
    }

    const primaryWorkerId = assignment.workerId;

    // 🔹 Find other active IRON workers
    const workers = await prisma.user.findMany({
      where: {
        apartmentId,
        role: "WORKER",
        isActive: true,
        id: { not: primaryWorkerId },
        workerProfile: {
          is: {
            service: "IRON",
            isActive: true,
            isAvailable: true
          }
        }
      },
      select: {
        id: true,
        name: true,
        phone: true
      }
    });

    res.json({
      success: true,
      data: workers
    });

  } catch (error) {
    console.error("OTHER WORKERS ERROR:", error);
    res.status(500).json({ success: false });
  }
});

// =======================================
// CREATE OPEN REQUEST (UNASSIGNED)
// =======================================
router.post("/open-request", async (req, res) => {

  try {

    const {
      residentId,
      apartmentId,
      flatId,
      clothesCount,
      bagColor,
      details,
      priority
    } = req.body;

    if (!residentId || !clothesCount) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    const request = await prisma.serviceRequest.create({
      data: {
        apartmentId,
        residentId,
        serviceType: "IRON",
        priority: priority || "MEDIUM",
        details: details || "",
        flatId,
        status: "PENDING",
        isEscalated: true,

        requestedClothes: clothesCount,
        confirmedClothes: clothesCount,
        bagColor
      }
    });

    res.json({
      success: true,
      message: "Request sent to other workers",
      data: request
    });

  } catch (error) {
    console.error("OPEN REQUEST ERROR:", error);
    res.status(500).json({ success: false });
  }
});

// =======================================
// GET WORKER DAILY CAPACITY
// =======================================
router.get("/capacity", async (req, res) => {
  try {

    const { workerId, date } = req.query;

    if (!workerId || !date) {
      return res.status(400).json({
        success: false,
        message: "workerId and date required"
      });
    }

    // 🔥 Parse selected date
    const selectedDate = new Date(date);

    // 🔥 Create safe day range
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    // 🔥 Get capacity record
    let capacity = await prisma.workerDailyCapacity.findUnique({
      where: {
        workerId_date: {
          workerId,
          date: startOfDay
        }
      }
    });

    // 🔥 Auto create default capacity if missing
    if (!capacity) {
      capacity = await prisma.workerDailyCapacity.create({
        data: {
          workerId,
          date: startOfDay,
          totalLimit: 100
        }
      });
    }

    // 🔥 Fetch accepted/in-progress/completed requests safely
    const requests = await prisma.serviceRequest.findMany({
      where: {
        workerId,
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

    // 🔥 Unified clothes calculation
    const used = requests.reduce((sum, r) => {

      const clothes =
        r.confirmedClothes ??
        r.requestedClothes ??
        r.ironItems.reduce((s, item) => s + item.quantity, 0);

      return sum + clothes;

    }, 0);

    return res.json({
      success: true,
      totalLimit: capacity.totalLimit,
      used,
      remaining: capacity.totalLimit - used
    });

  } catch (error) {
    console.error("CAPACITY FETCH ERROR:", error);
    res.status(500).json({ success: false });
  }
});

module.exports = router;