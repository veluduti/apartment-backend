const express = require("express");
const router = express.Router();
const prisma = require("../data/db");

// GET BLOCKS BY APARTMENT
router.get("/", async (req, res) => {
  try {
    const { apartmentId } = req.query;

    if (!apartmentId) {
      return res.json({
        success: false,
        message: "apartmentId required",
      });
    }

    const blocks = await prisma.block.findMany({
      where: { apartmentId },
      orderBy: { name: "asc" },
    });

    res.json({ success: true, data: blocks });

  } catch (error) {
    console.error(error);
    res.json({ success: false });
  }
});

module.exports = router;
