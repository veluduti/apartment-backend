const express = require("express");
const router = express.Router();

const { createApartment, getApartmentByCode, getAllApartments} = require("../controllers/apartmentController");
const { verifyToken } = require("../middleware/authMiddleware");

// 🔥 Public route (NO TOKEN needed)
router.get("/by-code", getApartmentByCode);
router.get("/list", getAllApartments);

// 🔥 Only SUPER_ADMIN access
router.post("/", verifyToken, async (req, res, next) => {
  if (req.user.role !== "SUPER_ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Only SUPER_ADMIN allowed"
    });
  }
  next();
}, createApartment);

module.exports = router;