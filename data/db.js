const { v4: uuidv4 } = require("uuid");

const db = {
  apartments: [],
  users: [],
  requests: []
};

module.exports = db;

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

module.exports = prisma;
