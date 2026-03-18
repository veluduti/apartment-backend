const prisma = require("../data/db");
const { assignPlumber } = require('../services/plumbing/plumbingAssignmentService');

const VISIT_SLA_HOURS = 2;

async function checkPlumberTimeout() {
  try {

    const timeoutLimit = new Date();
    timeoutLimit.setHours(timeoutLimit.getHours() - VISIT_SLA_HOURS);

    const expiredJobs = await prisma.serviceRequest.findMany({
      where: {
        serviceType: "PLUMBING",
        status: "ACCEPTED",
        acceptedAt: {
          lt: timeoutLimit
        }
      }
    });

    for (const job of expiredJobs) {

      console.log("Reassigning expired job:", job.id);

      const previousWorkerId = job.workerId; // 🔥 store before clearing

      await prisma.$transaction(async (tx) => {

        await tx.serviceRequest.update({
          where: { id: job.id },
          data: {
            status: "PENDING",
            workerId: null,
            acceptedAt: null
          }
        });

        await tx.requestStatusLog.create({
          data: {
            requestId: job.id,
            oldStatus: "ACCEPTED",
            newStatus: "AUTO_REASSIGNED",
            note: "SLA breach - auto reassigned"
          }
        });

      });

      // Reassign after transaction (exclude previous worker)
      await assignPlumber(job.apartmentId, job.id, previousWorkerId);
    }

  } catch (error) {
    console.error("Plumber Timeout Job Error:", error);
  }
}

module.exports = { checkPlumberTimeout };