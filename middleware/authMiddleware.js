const jwt = require("jsonwebtoken");

exports.verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // 🔴 Check header exists
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    // 🔴 Check format: Bearer TOKEN
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Invalid token format",
      });
    }

    const token = authHeader.split(" ")[1];

    // 🔴 Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔥 Attach user info (VERY IMPORTANT for multi-apartment)
    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      apartmentId: decoded.apartmentId,
    };

    next();

  } catch (error) {
    console.error("AUTH ERROR:", error.message);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};