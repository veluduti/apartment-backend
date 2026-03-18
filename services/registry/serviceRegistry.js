const plumbingService = require("../plumbing/plumbingService");

const services = {
  PLUMBING: plumbingService
};

function getService(type) {
  return services[type];
}

module.exports = { getService };