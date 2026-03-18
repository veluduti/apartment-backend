const express = require("express");
const router = express.Router();
const prisma = require("../data/db");

// GET FLATS BY BLOCK
router.get("/", async (req, res) => {
  try {
    const { blockId } = req.query;

    if (!blockId) {
      return res.json({
        success: false,
        message: "blockId required",
      });
    }

    const flats = await prisma.flat.findMany({
      where: {
        blockId,
        resident: null // only available flats
      },
      orderBy: { number: "asc" },
    });

    res.json({ success: true, data: flats });

  } catch (error) {
    console.error(error);
    res.json({ success: false });
  }
});

module.exports = router;
