const db = require("../data/db");
const { v4: uuidv4 } = require("uuid");

const createRequest = (data) => {

  const request = {
    id: uuidv4(),

    apartmentId: data.apartmentId,

    serviceType: data.serviceType,

    residentId: data.residentId,
    residentName: data.residentName,
    flatNumber: data.flatNumber,
    residentPhone: data.residentPhone,

    assignedWorkerId: null,
    assignedWorkerName: null,
    assignedWorkerPhone: null,

    details: data.details,

    status: "Pending",

    rejectionReason: null,

    requestedAt: new Date(),
    acceptedAt: null,
    completedAt: null,

    rating: null,
    feedback: null
  };

  db.requests.push(request);
  return request;
};

const getAllRequests = () => db.requests;

const updateRequest = (id, updates) => {
  const request = db.requests.find(r => r.id === id);
  if (!request) return null;

  Object.assign(request, updates);
  return request;
};

module.exports = {
  createRequest,
  getAllRequests,
  updateRequest
};
