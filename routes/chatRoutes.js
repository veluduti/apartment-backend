const express = require("express");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();


// =================================
// GET CHAT (Pagination Ready)
// =================================
router.get("/:requestId", async (req, res) => {

  const { requestId } = req.params;
  const { cursor } = req.query;

  try {

    let chatRoom = await prisma.chatRoom.findUnique({
  where: { requestId }
});

if (!chatRoom) {

  // 🔥 get request first
  const request = await prisma.serviceRequest.findUnique({
    where: { id: requestId }
  });

  if (!request) {
    return res.json({ success: false, message: "Request not found" });
  }

  chatRoom = await prisma.chatRoom.create({
    data: {
      request: {
        connect: { id: requestId }
      },
      resident: {
        connect: { id: request.residentId }
      },
      worker: request.workerId
        ? { connect: { id: request.workerId } }
        : undefined
    }
  });
}

    if (!chatRoom) {
      return res.json({ success: false });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { chatRoomId: chatRoom.id },
      take: 20,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: "desc" },
      include: { sender: true }
    });

    res.json({
      success: true,
      data: {
        id: chatRoom.id,
        messages: messages.reverse()
      }
    });

  } catch (error) {
    console.error("GET CHAT ERROR:", error);
    res.json({ success: false });
  }
});


// =================================
// SEND MESSAGE
// =================================
router.post("/send", async (req, res) => {

  const { requestId, senderId, message, type } = req.body;

  try {

    if (!requestId || !senderId || !message) {
      return res.json({ success: false });
    }

    let chatRoom = await prisma.chatRoom.findUnique({
  where: { requestId }
});

if (!chatRoom) {

  // 🔥 get request first
  const request = await prisma.serviceRequest.findUnique({
    where: { id: requestId }
  });

  if (!request) {
    return res.json({ success: false, message: "Request not found" });
  }

  chatRoom = await prisma.chatRoom.create({
    data: {
      request: {
        connect: { id: requestId }
      },
      resident: {
        connect: { id: request.residentId }
      },
      worker: request.workerId
        ? { connect: { id: request.workerId } }
        : undefined
    }
  });
}

    if (!chatRoom) {
      return res.json({ success: false });
    }

    const newMessage = await prisma.chatMessage.create({
      data: {
        chatRoomId: chatRoom.id,
        senderId,
        message,
        type: type || "TEXT",
        deliveredAt: new Date()
      },
      include: { sender: true }
    });

    const io = req.app.get("io");

    // ✅ ROOM SCOPED EMIT
    io.to(chatRoom.id).emit("receiveMessage", newMessage);

    res.json({ success: true, data: newMessage });

  } catch (error) {
    console.error("SEND MESSAGE ERROR:", error);
    res.json({ success: false });
  }
});


// =================================
// MARK AS SEEN
// =================================
router.post("/seen", async (req, res) => {

  const { chatRoomId, userId } = req.body;

  try {

    await prisma.chatMessage.updateMany({
      where: {
        chatRoomId,
        senderId: { not: userId },
        seenAt: null
      },
      data: { seenAt: new Date() }
    });

    const io = req.app.get("io");
    io.to(chatRoomId).emit("seenUpdate");

    res.json({ success: true });

  } catch (error) {
    console.error("SEEN ERROR:", error);
    res.json({ success: false });
  }
});


// =================================
// EDIT MESSAGE
// =================================
router.post("/edit", async (req, res) => {

  const { messageId, newMessage } = req.body;

  try {

    const updated = await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        message: newMessage,
        isEdited: true
      }
    });

    const io = req.app.get("io");

    // 🔥 GET ROOM ID
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId }
    });

    // ✅ ROOM SCOPED EMIT
    io.to(message.chatRoomId).emit("messageEdited", updated);

    res.json({ success: true });

  } catch (error) {
    console.error("EDIT ERROR:", error);
    res.json({ success: false });
  }
});


// =================================
// DELETE MESSAGE (FOR EVERYONE)
// =================================
router.post("/delete", async (req, res) => {

  const { messageId } = req.body;

  try {

    const deleted = await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        message: "This message was deleted"
      }
    });

    const io = req.app.get("io");

    // 🔥 GET ROOM ID
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId }
    });

    // ✅ ROOM SCOPED EMIT
    io.to(message.chatRoomId).emit("messageDeleted", deleted);

    res.json({ success: true });

  } catch (error) {
    console.error("DELETE ERROR:", error);
    res.json({ success: false });
  }
});

module.exports = router;