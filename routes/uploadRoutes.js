const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// Absolute folder path
const uploadDir = path.join(__dirname, "..", "uploads", "plumbing");

// Ensure folder exists
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const unique =
      Date.now() + "-" + Math.round(Math.random() * 1e9);

    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

router.post("/plumbing", upload.single("image"), (req, res) => {

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "No file uploaded"
    });
  }

  const fileUrl =
    `${req.protocol}://${req.get("host")}/uploads/plumbing/${req.file.filename}`;

  res.json({
    success: true,
    url: fileUrl
  });

});

module.exports = router;