const requestModel = require("../models/requestModel");
const userModel = require("../models/userModel");


// 🔹 Create Service Request
const createRequest = (req, res) => {

  const {
    apartmentId,
    serviceType,
    residentId,
    residentName,
    flatNumber,
    residentPhone,
    details
  } = req.body;

  if (!apartmentId || !serviceType || !residentId || !details) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields"
    });
  }

  const request = requestModel.createRequest({
    apartmentId,
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


// 🔹 Get All Requests (Apartment Wise)
const getRequests = (req, res) => {

  const { apartmentId } = req.query;

  const allRequests = requestModel.getAllRequests();

  const filtered = apartmentId
    ? allRequests.filter(r => r.apartmentId === apartmentId)
    : allRequests;

  res.json({
    success: true,
    data: filtered
  });
};


// 🔹 Accept Request (Assign Worker)
const acceptRequest = (req, res) => {

  const { requestId, workerId } = req.body;

  if (!requestId || !workerId) {
    return res.status(400).json({
      success: false,
      message: "Missing requestId or workerId"
    });
  }

  const worker = userModel.getWorkersByService("")
    .find(w => w.id === workerId);

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

  if (!updated) {
    return res.status(404).json({
      success: false,
      message: "Request not found"
    });
  }

  res.json({
    success: true,
    data: updated
  });
};


// 🔹 Update Status (Start Work / Complete)
const updateStatus = (req, res) => {

  const { requestId, status } = req.body;

  if (!requestId || !status) {
    return res.status(400).json({
      success: false,
      message: "Missing requestId or status"
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

  if (!updated) {
    return res.status(404).json({
      success: false,
      message: "Request not found"
    });
  }

  res.json({
    success: true,
    data: updated
  });
};


// 🔹 Reject Request
const rejectRequest = (req, res) => {

  const { requestId, reason } = req.body;

  const updated = requestModel.updateRequest(requestId, {
    status: "Rejected",
    rejectionReason: reason || null
  });

  if (!updated) {
    return res.status(404).json({
      success: false,
      message: "Request not found"
    });
  }

  res.json({
    success: true,
    data: updated
  });
};


module.exports = {
  createRequest,
  getRequests,
  acceptRequest,
  updateStatus,
  rejectRequest
};