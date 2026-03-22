const prisma = require("../data/db");

// 🔥 CREATE APARTMENT
exports.createApartment = async (req, res) => {
  try {
    const { name, code, city } = req.body;

    // Validation
    if (!name || !code) {
      return res.json({
        success: false,
        message: "Name and code are required"
      });
    }

    // Check duplicate code
    const existing = await prisma.apartment.findUnique({
      where: { code }
    });

    if (existing) {
      return res.json({
        success: false,
        message: "Apartment code already exists"
      });
    }

    // Create apartment
    const apartment = await prisma.apartment.create({
      data: {
        name,
        code,
        city
      }
    });

    return res.json({
      success: true,
      data: apartment
    });

  } catch (error) {
    console.error("CREATE APARTMENT ERROR:", error);
    return res.json({
      success: false,
      message: "Server error"
    });
  }
};

// 🔥 GET APARTMENT BY CODE
exports.getApartmentByCode = async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.json({
        success: false,
        message: "Code is required"
      });
    }

    const apartment = await prisma.apartment.findUnique({
      where: { code }
    });

    if (!apartment) {
      return res.json({
        success: false,
        message: "Apartment not found"
      });
    }

    return res.json({
      success: true,
      data: {
        id: apartment.id,
        name: apartment.name
      }
    });

  } catch (error) {
    console.error("GET APARTMENT ERROR:", error);
    return res.json({
      success: false,
      message: "Server error"
    });
  }
};

exports.getAllApartments = async (req, res) => {
  try {

    const apartments = await prisma.apartment.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    res.json({
      success: true,
      data: apartments
    });

  } catch (error) {
    console.error(error);
    res.json({
      success: false,
      message: "Server error"
    });
  }
};