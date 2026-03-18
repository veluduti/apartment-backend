const express = require("express");
const router = express.Router();
const db = require("../data/db");

router.get("/apartments", (req, res) => {
  res.json({ success: true, data: db.apartments });
});

router.get("/users", (req, res) => {
  res.json({ success: true, data: db.users });
});

module.exports = router;
