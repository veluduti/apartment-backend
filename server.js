require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
const uploadRoutes = require("./routes/uploadRoutes");

const cron = require("node-cron");
const { checkPlumberTimeout } = require("./jobs/plumberTimeoutJob");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const otpRoutes = require("./routes/otpRoutes");
const requestRoutes = require("./routes/requestRoutes");
const debugRoutes = require("./routes/debugRoutes");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const blockRoutes = require("./routes/blockRoutes");
const flatRoutes = require("./routes/flatRoutes");
const chatRoutes = require("./routes/chatRoutes");
const slotRoutes = require("./routes/slotRoutes");
const ironRoutes = require("./routes/ironRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const plumberRoutes = require("./routes/plumberRoutes");
const translateRoutes = require("./routes/translateRoutes");

const app = express();
const server = http.createServer(app);

// ===============================
// SOCKET.IO SETUP
// ===============================
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let onlineUsers = {}; // userId -> socketId

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  // Register user for online tracking
  socket.on("registerUser", (userId) => {
    onlineUsers[userId] = socket.id;
    socket.join(userId);
    io.emit("onlineUsers", Object.keys(onlineUsers));
  });

  // Join chat room
  socket.on("joinRoom", (roomId) => {
    socket.join(roomId);
    console.log(`User joined room: ${roomId}`);
  });

  // Typing indicator
  socket.on("typing", ({ roomId, userId }) => {
    socket.to(roomId).emit("typing", { userId });
  });

  // Seen event
  socket.on("markSeen", ({ roomId }) => {
    socket.to(roomId).emit("messagesSeen");
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);

    for (let userId in onlineUsers) {
      if (onlineUsers[userId] === socket.id) {
        delete onlineUsers[userId];
      }
    }

    io.emit("onlineUsers", Object.keys(onlineUsers));
  });
});

// Make io accessible in routes
app.set("io", io);

// ===============================
// MIDDLEWARE
// ===============================
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type"],
  })
);

cron.schedule(
  "*/10 * * * *",
  async () => {
    console.log("Running plumber timeout check...");
    await checkPlumberTimeout();
  },
  {
    timezone: "Asia/Kolkata"
  }
);

app.use(express.json());

// ===============================
// API ROUTES
// ===============================
app.use("/api/blocks", blockRoutes);
app.use("/api/flats", flatRoutes);
app.use("/api/otp", otpRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/debug", debugRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/slots", slotRoutes);
app.use("/api/iron", ironRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/plumber", plumberRoutes);
app.use("/api/translate", translateRoutes);
app.use("/upload", uploadRoutes);
app.use("/uploads", express.static("uploads"));


// ===============================
// START SERVER
// ===============================
const PORT = 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});