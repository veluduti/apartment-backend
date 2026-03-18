const prisma = require("../../data/db");
const admin = require("../../firebase");
const { assignPlumber } = require("./plumbingAssignmentService");

async function onCreate(newRequest, body) {

  // Prevent multiple plumbing jobs for same flat
  const activeJob = await prisma.serviceRequest.findFirst({
    where: {
      flatId: newRequest.flatId,
      serviceType: "PLUMBING",
      id: { not: newRequest.id },
      status: {
        in: ["PENDING", "ACCEPTED", "VISITED", "QUOTED", "IN_PROGRESS"]
      }
    }
  });

  if (activeJob) {
    throw new Error("ACTIVE_PLUMBING_EXISTS");
  }

  const { problemTitle, photos } = body;

  // Fallback title
  const finalTitle =
    problemTitle && problemTitle.trim() !== ""
      ? problemTitle
      : newRequest.details?.substring(0, 50) || "Plumbing Issue";

  // Create plumber details
  await prisma.plumberDetails.create({
    data: {
      requestId: newRequest.id,
      problemTitle: finalTitle,
      description: newRequest.details,
      photos: Array.isArray(photos) ? photos : []
    }
  });

  // Assign plumber automatically
  const assigned = await assignPlumber(
    newRequest.apartmentId,
    newRequest.id
  );

  // Send notification
  if (assigned && assigned.fcmToken) {
    await admin.messaging().send({
      token: assigned.fcmToken,
      notification: {
        title: "New Plumbing Request",
        body: "New job assigned to you"
      }
    });
  }
}

module.exports = {
  type: "PLUMBING",
  onCreate
};