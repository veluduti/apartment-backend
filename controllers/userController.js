const prisma = require("../data/db");
const jwt = require("jsonwebtoken");

// ================= PHONE NORMALIZER =================
function normalizePhone(phone) {
  if (!phone) return null;

  phone = phone.replace(/\s+/g, "");

  if (phone.startsWith("+")) {
    return phone;
  }

  return "+91" + phone;
}

// ====================================================
// ================= REGISTER USER ====================
// ====================================================
exports.registerUser = async (req, res) => {
  try {
    let {
      name,
      phone,
      email,
      role,
      apartmentId, // 🔥 allowed (public API)
      flatId
    } = req.body;

    phone = normalizePhone(phone);

    if (!name || !phone || !role || !apartmentId) {
      return res.json({
        success: false,
        message: "Required fields missing"
      });
    }

    // 🔥 Validate apartment exists (optional but good)
    const apartment = await prisma.apartment.findUnique({
      where: { id: apartmentId }
    });

    if (!apartment) {
      return res.json({
        success: false,
        message: "Invalid apartment"
      });
    }

    // ================= DUPLICATE CHECK =================
    const existingUser = await prisma.user.findFirst({
      where: { phone, apartmentId }
    });

    if (existingUser) {
      return res.json({
        success: false,
        message: "User already registered"
      });
    }

    // ================= RESIDENT =================
    if (role === "RESIDENT") {

      if (!flatId) {
        return res.json({
          success: false,
          message: "Flat selection required"
        });
      }

      await prisma.$transaction(async (tx) => {

        const flat = await tx.flat.findUnique({
          where: { id: flatId }
        });

        if (!flat || flat.apartmentId !== apartmentId) {
          throw new Error("Invalid flat selected");
        }

        await tx.user.create({
          data: {
            name,
            phone,
            email: email || null,
            role,
            apartmentId,
            flatId,
            flatNumber: flat.number,
            isActive: false,
            status: "PENDING"
          }
        });

      });

      return res.json({
        success: true,
        message: "Registration submitted. Await admin approval."
      });
    }

    // ================= WORKER =================
    if (role === "WORKER") {

      await prisma.user.create({
        data: {
          name,
          phone,
          email: email || null,
          role,
          apartmentId,
          isActive: false,
          status: "PENDING"
        }
      });

      return res.json({
        success: true,
        message: "Registration submitted. Await admin approval."
      });
    }

    // ================= ADMIN =================
    if (role === "ADMIN") {

      // 🔥 Only SUPER_ADMIN should create ADMIN (enforce later in routes)
      await prisma.user.create({
        data: {
          name,
          phone,
          email,
          role,
          apartmentId,
          isActive: true,
          status: "APPROVED"
        }
      });

      return res.json({
        success: true,
        message: "Admin created successfully"
      });
    }

    return res.json({
      success: false,
      message: "Invalid role"
    });

  } catch (error) {
    console.error("REGISTER ERROR:", error.message);
    return res.json({
      success: false,
      message: error.message || "Database error"
    });
  }
};

// ====================================================
// ================= CHECK USER ========================
// ====================================================
exports.checkUser = async (req, res) => {
  try {
    let { phone, apartmentId } = req.query;

    phone = normalizePhone(phone);

    const user = await prisma.user.findFirst({
      where: { phone, apartmentId }
    });

    if (!user) {
      return res.json({ exists: false });
    }

    return res.json({
      exists: true,
      role: user.role,
      isActive: user.isActive
    });

  } catch (error) {
    return res.json({ exists: false });
  }
};

// ====================================================
// ================= LOGIN =============================
// ====================================================
exports.loginUser = async (req, res) => {
  try {

    let { phone, apartmentId } = req.body;

    phone = normalizePhone(phone);

    if (!phone) {
      return res.json({
        success: false,
        message: "Phone required"
      });
    }

    let user = null;

    // 🔥 Normal user
    if (apartmentId) {
      user = await prisma.user.findFirst({
        where: {
          phone,
          apartmentId
        },
        include: {
          workerProfile: true
        }
      });
    }

    // 🔥 SUPER_ADMIN fallback
    if (!user) {
      user = await prisma.user.findFirst({
        where: {
          phone,
          role: "SUPER_ADMIN"
        }
      });
    }

    if (!user) {
      return res.json({
        success: false,
        message: "User not found"
      });
    }

    if (user.role !== "SUPER_ADMIN" && !user.isActive) {
      return res.json({
        success: false,
        message: "Await admin approval"
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        apartmentId: user.apartmentId
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        apartmentId: user.apartmentId,
        flatNumber: user.flatNumber,
        flatId: user.flatId,
        workerProfile: user.workerProfile || null
      }
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);
    return res.json({
      success: false,
      message: "Server error"
    });
  }
};