const express = require("express");
const router = express.Router();

const {
  getPendingUsers,
  approveUser,
  rejectUser,
  getUserHistory,
  assignFlatToWorker
} = require("../controllers/adminController");

const { verifyToken } = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/roleMiddleware");

// ================= ADMIN ROUTES =================

// Get pending users
router.get(
  "/pending-users",
  verifyToken,
  requireAdmin,
  getPendingUsers
);

// Approve user
router.put(
  "/approve/:id",
  verifyToken,
  requireAdmin,
  approveUser
);

// Reject user
router.put(
  "/reject/:id",
  verifyToken,
  requireAdmin,
  rejectUser
);

// Get history
router.get(
  "/history",
  verifyToken,
  requireAdmin,
  getUserHistory
);

// 🔥 Assign flat to worker
router.post(
  "/assign-flat",
  verifyToken,
  requireAdmin,
  assignFlatToWorker
);

module.exports = router;