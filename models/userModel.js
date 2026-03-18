const db = require("../data/db");
const { v4: uuidv4 } = require("uuid");

const createUser = (data) => {

  const user = {
    id: uuidv4(),
    name: data.name,
    phone: data.phone,
    role: data.role, // resident | worker | admin

    apartmentId: data.apartmentId || null,
    flatNumber: data.flatNumber || null,

    serviceType: data.serviceType || null,
    isActive: true,

    createdAt: new Date(),
    updatedAt: new Date()
  };

  db.users.push(user);
  return user;
};

const getUserByPhone = (phone) =>
  db.users.find(u => u.phone === phone);

const getWorkersByService = (serviceType) =>
  db.users.filter(
    u => u.role === "worker" && 
         u.serviceType === serviceType &&
         u.isActive
  );

module.exports = {
  createUser,
  getUserByPhone,
  getWorkersByService
};
