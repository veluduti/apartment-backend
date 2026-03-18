const express = require("express");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();

// =================================
// GET IRON PRICING BY APARTMENT
// =================================
router.get("/pricing", async (req, res) => {
  try {

    const { apartmentId } = req.query;

    if (!apartmentId) {
      return res.json({
        success: false,
        message: "apartmentId required"
      });
    }

    const pricing = await prisma.ironPricing.findMany({
      where: { apartmentId },
      orderBy: { clothType: "asc" }
    });

    res.json({
      success: true,
      data: pricing
    });

  } catch (error) {
    console.error("PRICING ERROR:", error);
    res.json({ success: false });
  }
});

module.exports = router;