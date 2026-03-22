const express = require("express");
const router = express.Router();
const prisma = require("../data/db");
const { verifyToken } = require("../middleware/authMiddleware");

// 🔥 GET FLATS BY BLOCK (SECURE)
router.get("/", verifyToken, async (req, res) => {
  try {
    const { blockId } = req.query;
    const apartmentId = req.user.apartmentId; // 🔥 from token

    if (!blockId) {
      return res.json({
        success: false,
        message: "blockId required",
      });
    }

    // 🔥 Step 1: Validate block belongs to same apartment
    const block = await prisma.block.findUnique({
      where: { id: blockId }
    });

    if (!block || block.apartmentId !== apartmentId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to block"
      });
    }

    // 🔥 Step 2: Fetch flats securely
    const flats = await prisma.flat.findMany({
      where: {
        blockId,
        apartmentId, // 🔥 enforce apartment isolation
        resident: null
      },
      orderBy: { number: "asc" },
    });

    res.json({
      success: true,
      data: flats
    });

  } catch (error) {
    console.error("FLAT ERROR:", error);
    res.json({
      success: false,
      message: "Server error"
    });
  }
});

module.exports = router;