-- CreateEnum
CREATE TYPE "PickupType" AS ENUM ('NORMAL', 'URGENT');

-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'CONFIRMED';

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "bagColor" TEXT,
ADD COLUMN     "confirmedClothes" INTEGER,
ADD COLUMN     "pickupDate" TIMESTAMP(3),
ADD COLUMN     "pickupSlotId" TEXT,
ADD COLUMN     "pickupType" "PickupType",
ADD COLUMN     "requestedClothes" INTEGER;

-- CreateTable
CREATE TABLE "WorkerDailyCapacity" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalLimit" INTEGER NOT NULL,
    "usedLimit" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerDailyCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupSlot" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "type" "PickupType" NOT NULL,
    "maxCapacity" INTEGER NOT NULL,
    "usedCapacity" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PickupSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkerDailyCapacity_workerId_idx" ON "WorkerDailyCapacity"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerDailyCapacity_workerId_date_key" ON "WorkerDailyCapacity"("workerId", "date");

-- CreateIndex
CREATE INDEX "PickupSlot_workerId_idx" ON "PickupSlot"("workerId");

-- CreateIndex
CREATE INDEX "PickupSlot_date_idx" ON "PickupSlot"("date");

-- CreateIndex
CREATE INDEX "PickupSlot_type_idx" ON "PickupSlot"("type");

-- AddForeignKey
ALTER TABLE "WorkerDailyCapacity" ADD CONSTRAINT "WorkerDailyCapacity_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupSlot" ADD CONSTRAINT "PickupSlot_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupSlot" ADD CONSTRAINT "PickupSlot_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_pickupSlotId_fkey" FOREIGN KEY ("pickupSlotId") REFERENCES "PickupSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
