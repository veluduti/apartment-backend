const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

// Prevent multiple initialization
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;
