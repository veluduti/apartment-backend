const prisma = require("../../data/db");

async function assignPlumber(apartmentId, requestId, excludedWorkerId = null) {

  try {
    console.log("🔍 Assigning plumber for apartment:", apartmentId);

    // ✅ Get all workers with workerProfile
    const workers = await prisma.user.findMany({
      where: { apartmentId },
      include: { workerProfile: true }
    });

    console.log("👥 Total workers in apartment:", workers.length);

    // ✅ Filter plumbers manually (more reliable than relation filter)
    const plumbers = workers.filter(w =>
      w.workerProfile &&
      w.workerProfile.service === "PLUMBING" &&
      (!excludedWorkerId || w.id !== excludedWorkerId)
    );

    console.log("🚰 Filtered plumbers:", plumbers.length);

    if (!plumbers.length) {
      console.log("❌ No plumbers found");
      return null;
    }

    const plumberIds = plumbers.map(p => p.id);

    // ✅ Get active load per plumber
    const loads = await prisma.serviceRequest.groupBy({
      by: ["workerId"],
      where: {
        workerId: { in: plumberIds },
        serviceType: "PLUMBING",
        status: {
          in: ["ACCEPTED", "VISITED", "QUOTED", "IN_PROGRESS"]
        }
      },
      _count: {
        workerId: true
      }
    });

    const loadMap = {};
    loads.forEach(l => {
      loadMap[l.workerId] = l._count.workerId;
    });

    // ✅ Attach active job count
    const plumberWithLoad = plumbers.map(p => ({
      id: p.id,
      fcmToken: p.fcmToken,
      activeCount: loadMap[p.id] || 0
    }));

    // ✅ Sort by least active jobs
    plumberWithLoad.sort((a, b) => a.activeCount - b.activeCount);

    const selected = plumberWithLoad[0];

    if (!selected) {
      console.log("❌ No plumber selected");
      return null;
    }

    console.log("✅ Selected plumber:", selected.id);

    // ✅ Update workerId in request
    await prisma.serviceRequest.update({
      where: { id: requestId },
      data: {
        workerId: selected.id
      }
    });

    console.log("✅ workerId updated in DB");

    return selected;

  } catch (error) {
    console.error("🚨 ASSIGN PLUMBER ERROR:", error);
    return null;
  }
}

module.exports = { assignPlumber };