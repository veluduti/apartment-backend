const requestModel = require("../models/requestModel");
const userModel = require("../models/userModel");


// 🔹 Create Service Request
const createRequest = (req, res) => {

  const {
    serviceType,
    residentId,
    residentName,
    flatNumber,
    residentPhone,
    details
  } = req.body;

  const apartmentId = req.user.apartmentId; // 🔥 FIX

  if (!serviceType || !residentId || !details) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields"
    });
  }

  const request = requestModel.createRequest({
    apartmentId, // 🔥 always from token
    serviceType,
    residentId,
    residentName,
    flatNumber,
    residentPhone,
    details
  });

  res.json({
    success: true,
    data: request
  });
};


// 🔹 Get All Requests (SECURE)
const getRequests = (req, res) => {

  const apartmentId = req.user.apartmentId; // 🔥 FIX

  const allRequests = requestModel.getAllRequests();

  const filtered = allRequests.filter(
    r => r.apartmentId === apartmentId
  );

  res.json({
    success: true,
    data: filtered
  });
};


// 🔹 Accept Request
const acceptRequest = (req, res) => {

  const { requestId, workerId } = req.body;
  const apartmentId = req.user.apartmentId;

  if (!requestId || !workerId) {
    return res.status(400).json({
      success: false,
      message: "Missing requestId or workerId"
    });
  }

  const request = requestModel.getAllRequests()
    .find(r => r.id === requestId);

  // 🔥 SECURITY CHECK
  if (!request || request.apartmentId !== apartmentId) {
    return res.status(403).json({
      success: false,
      message: "Unauthorized access"
    });
  }

  const worker = userModel.getWorkersByService("")
    .find(w => w.id === workerId && w.apartmentId === apartmentId);

  if (!worker) {
    return res.status(404).json({
      success: false,
      message: "Worker not found"
    });
  }

  const updated = requestModel.updateRequest(requestId, {
    assignedWorkerId: worker.id,
    assignedWorkerName: worker.name,
    assignedWorkerPhone: worker.phone,
    status: "Accepted",
    acceptedAt: new Date()
  });

  res.json({
    success: true,
    data: updated
  });
};


// 🔹 Update Status
const updateStatus = (req, res) => {

  const { requestId, status } = req.body;
  const apartmentId = req.user.apartmentId;

  if (!requestId || !status) {
    return res.status(400).json({
      success: false,
      message: "Missing requestId or status"
    });
  }

  const request = requestModel.getAllRequests()
    .find(r => r.id === requestId);

  // 🔥 SECURITY CHECK
  if (!request || request.apartmentId !== apartmentId) {
    return res.status(403).json({
      success: false,
      message: "Unauthorized access"
    });
  }

  const updates = { status };

  if (status === "In Progress") {
    updates.startedAt = new Date();
  }

  if (status === "Completed") {
    updates.completedAt = new Date();
  }

  const updated = requestModel.updateRequest(requestId, updates);

  res.json({
    success: true,
    data: updated
  });
};


// 🔹 Reject Request
const rejectRequest = (req, res) => {

  const { requestId, reason } = req.body;
  const apartmentId = req.user.apartmentId;

  const request = requestModel.getAllRequests()
    .find(r => r.id === requestId);

  // 🔥 SECURITY CHECK
  if (!request || request.apartmentId !== apartmentId) {
    return res.status(403).json({
      success: false,
      message: "Unauthorized access"
    });
  }

  const updated = requestModel.updateRequest(requestId, {
    status: "Rejected",
    rejectionReason: reason || null
  });

  res.json({
    success: true,
    data: updated
  });
};

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const addIronItems = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { items } = req.body;

    if (!items || items.length === 0) {
      return res.json({
        success: false,
        message: "No items provided"
      });
    }

    // 🔥 Get request to know apartmentId
    const request = await prisma.serviceRequest.findUnique({
      where: { id: requestId }
    });

    if (!request) {
      return res.json({ success: false, message: "Request not found" });
    }

    // 🔥 Get pricing from DB
    const pricing = await prisma.ironPricing.findMany({
      where: { apartmentId: request.apartmentId }
    });

    // 🔥 Create price map
    const priceMap = {};
    pricing.forEach(p => {
      priceMap[p.clothType] = p.price;
    });

    // delete old items
    await prisma.ironItem.deleteMany({
      where: { requestId }
    });

    // 🔥 calculate total properly
    let totalAmount = 0;
    let totalClothes = 0;

    const itemsToSave = items.map(item => {

      const price = priceMap[item.clothType] ?? 0;

      totalAmount += item.quantity * price;
      totalClothes += item.quantity;

      return {
        requestId,
        clothType: item.clothType,
        quantity: item.quantity,
        pricePerUnit: price
      };
    });

    // create new items
    await prisma.ironItem.createMany({
      data: itemsToSave
    });

    // update request
    await prisma.serviceRequest.update({
      where: { id: requestId },
      data: {
        totalAmount,
        requestedClothes: totalClothes
      }
    });

    res.json({
      success: true,
      message: "Items updated successfully"
    });

  } catch (error) {
    console.error("ADD ITEMS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};


module.exports = {
  createRequest,
  getRequests,
  acceptRequest,
  updateStatus,
  rejectRequest,
  addIronItems 
};
