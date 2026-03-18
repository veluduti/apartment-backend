const prisma = require("../data/db");

// ================= GET PENDING USERS =================
exports.getPendingUsers = async (req, res) => {
  try {

    const users = await prisma.user.findMany({
      where: {
        status: "PENDING",
        role: {
          in: ["RESIDENT", "WORKER"]
        }
      },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    res.json({
      success: true,
      users
    });

  } catch (error) {
    res.json({
      success: false,
      message: "Server error"
    });
  }
};


// ================= APPROVE USER =================

exports.approveUser = async (req, res) => {
  try {

    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id }
    });

    await prisma.user.update({
      where: { id },
      data: {
        status: "APPROVED",
        isActive: true,
        rejectionReason: null,
        actionAt: new Date(),
      },
    });

    // 🔥 If worker → create worker profile
    if (user.role === "WORKER") {

      const exists = await prisma.workerProfile.findUnique({
        where: { userId: id }
      });

      if (!exists) {

        await prisma.workerProfile.create({
          data: {
            userId: id,
            service: "PLUMBING", // or IRON depending
            experienceYears: 0
          }
        });

      }

    }

    return res.json({
      success: true,
      message: "User approved successfully",
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Approval failed",
    });
  }
};


// ================= ASSIGN FLAT TO WORKER =================
exports.assignFlatToWorker = async (req, res) => {

  try {

    const { workerId, flatId } = req.body;

    if (!workerId || !flatId) {
      return res.json({
        success: false,
        message: "workerId and flatId required"
      });
    }

    // Check worker
    const worker = await prisma.user.findUnique({
      where: { id: workerId }
    });

    if (!worker || worker.role !== "WORKER") {
      return res.json({
        success: false,
        message: "Invalid worker"
      });
    }

    // Check flat exists
    const flat = await prisma.flat.findUnique({
      where: { id: flatId }
    });

    if (!flat) {
      return res.json({
        success: false,
        message: "Flat not found"
      });
    }

    // Assign (one flat → one worker)
    await prisma.workerFlat.upsert({
      where: { flatId },
      update: { workerId },
      create: {
        workerId,
        flatId
      }
    });

    return res.json({
      success: true,
      message: "Flat assigned successfully"
    });

  } catch (error) {
    console.error(error);
    return res.json({
      success: false,
      message: "Assignment failed"
    });
  }
};


// ================= REJECT USER =================
exports.rejectUser = async (req, res) => {

  try {

    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim() === "") {
      return res.json({
        success: false,
        message: "Rejection reason required",
      });
    }

    await prisma.user.update({
      where: { id },
      data: {
        status: "REJECTED",
        isActive: false,
        rejectionReason: reason,
        actionAt: new Date(),
      },
    });

    return res.json({
      success: true,
      message: "User rejected",
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Reject failed",
    });
  }
};


// ================= GET HISTORY =================
exports.getUserHistory = async (req, res) => {
  try {

    const { role } = req.query;

    const whereCondition = {
      status: {
        in: ["APPROVED", "REJECTED"]
      },
      role: {
        in: ["RESIDENT", "WORKER"]
      }
    };

    if (role && role !== "ALL") {
      whereCondition.role = role;
    }

    const users = await prisma.user.findMany({
      where: whereCondition,
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        rejectionReason: true,
        actionAt: true
      },
      orderBy: {
        actionAt: "desc"
      }
    });

    res.json({
      success: true,
      users
    });

  } catch (error) {
    res.json({
      success: false,
      message: "Server error"
    });
  }
};