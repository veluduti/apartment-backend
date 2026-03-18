const express = require("express");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();
const userController = require("../controllers/userController");

// ================= AUTH ROUTES =================
router.post("/register", userController.registerUser);
router.get("/check-user", userController.checkUser);
router.post("/login", userController.loginUser);


// =================================
// GET WORKERS BY SERVICE
// =================================
router.get("/workers", async (req, res) => {
  try {
    const { service } = req.query;

    const workers = await prisma.user.findMany({
      where: {
        role: "WORKER",
        isActive: true,
        workerProfile: {
          is: {
            service: service,
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
    console.error(error);
    res.status(500).json({ success: false });
  }
});


// =================================
// GET ASSIGNED RESIDENTS FOR WORKER
// =================================
router.get("/assigned-residents/:workerId", async (req, res) => {
  try {
    const { workerId } = req.params;

    const assignments = await prisma.workerFlat.findMany({
      where: {
        workerId: workerId
      },
      include: {
        flat: {
          include: {
            resident: true
          }
        }
      }
    });

    const residents = assignments
      .filter(a => a.flat.resident)
      .map(a => ({
        flatNumber: a.flat.number,
        residentName: a.flat.resident.name,
        residentPhone: a.flat.resident.phone
      }));

    res.json({
      success: true,
      data: residents
    });

  } catch (error) {
    console.error("ASSIGNED RESIDENT ERROR:", error);
    res.status(500).json({ success: false });
  }
});

module.exports = router;