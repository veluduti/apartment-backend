const db = require("../data/db");
const { v4: uuidv4 } = require("uuid");

const createApartment = (name, address) => {
  const apartment = {
    id: uuidv4(),
    name,
    address,
    createdAt: new Date()
  };

  db.apartments.push(apartment);
  return apartment;
};

const getAllApartments = () => db.apartments;

module.exports = {
  createApartment,
  getAllApartments
};
