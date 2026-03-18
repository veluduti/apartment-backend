const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function seed() {
  console.log("🌱 Seeding system data...");

  // =============================
  // 1️⃣ Create or get Apartment
  // =============================
  let apartment = await prisma.apartment.findFirst({
    where: { name: "Green Valley Residency" },
  });

  if (!apartment) {
    apartment = await prisma.apartment.create({
      data: {
        name: "Green Valley Residency",
        code: "GVR001",
        city: "Hyderabad",
        country: "India",
      },
    });
    console.log("🏢 Apartment created");
  } else {
    console.log("🏢 Apartment already exists");
  }

  // =============================
  // 2️⃣ Create Admins
  // =============================
  const adminList = [
    {
      name: "Admin1",
      phone: "+919999990000",
      email: "admin1@apartment.com",
    },
    {
      name: "Admin2",
      phone: "+919999990001",
      email: "admin2@apartment.com",
    },
  ];

  for (const adminData of adminList) {
    const existingAdmin = await prisma.user.findFirst({
      where: { phone: adminData.phone },
    });

    if (!existingAdmin) {
      await prisma.user.create({
        data: {
          name: adminData.name,
          phone: adminData.phone,
          email: adminData.email,
          role: "ADMIN",
          apartmentId: apartment.id,
          status: "APPROVED",
          isActive: true,
        },
      });
      console.log(`🔥 ${adminData.name} created`);
    } else {
      console.log(`🔥 ${adminData.name} already exists`);
    }
  }

  // =============================
  // 3️⃣ Create Blocks
  // =============================
  const blockStructure = [
    { name: "A", flats: 40 },
    { name: "B", flats: 30 },
    { name: "C", flats: 30 },
  ];

  for (const blockData of blockStructure) {

    let block = await prisma.block.findFirst({
      where: {
        name: blockData.name,
        apartmentId: apartment.id,
      },
    });

    if (!block) {
      block = await prisma.block.create({
        data: {
          name: blockData.name,
          apartmentId: apartment.id,
        },
      });
      console.log(`🏢 Block ${blockData.name} created`);
    } else {
      console.log(`🏢 Block ${blockData.name} already exists`);
    }

    // =============================
    // 4️⃣ Create Flats for each Block
    // =============================
    for (let i = 1; i <= blockData.flats; i++) {

      const flatNumber = `${blockData.name}-${i
        .toString()
        .padStart(3, "0")}`;

      const existingFlat = await prisma.flat.findFirst({
        where: {
          number: flatNumber,
          blockId: block.id,
        },
      });

      if (!existingFlat) {
        await prisma.flat.create({
          data: {
            number: flatNumber,
            blockId: block.id,
          },
        });
      }
    }

    console.log(`🏠 Flats created for Block ${blockData.name}`);
  }

  console.log("✅ System seeding complete");
}

seed()
  .catch((e) => {
    console.error("❌ Seeding error:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
