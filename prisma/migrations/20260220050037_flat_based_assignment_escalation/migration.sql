/*
  Warnings:

  - Added the required column `flatId` to the `ServiceRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "flatId" TEXT NOT NULL,
ADD COLUMN     "isEscalated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WorkerFlat" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "flatId" TEXT NOT NULL,

    CONSTRAINT "WorkerFlat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkerFlat_workerId_idx" ON "WorkerFlat"("workerId");

-- CreateIndex
CREATE INDEX "WorkerFlat_flatId_idx" ON "WorkerFlat"("flatId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerFlat_workerId_flatId_key" ON "WorkerFlat"("workerId", "flatId");

-- CreateIndex
CREATE INDEX "ServiceRequest_flatId_idx" ON "ServiceRequest"("flatId");

-- CreateIndex
CREATE INDEX "ServiceRequest_isEscalated_idx" ON "ServiceRequest"("isEscalated");

-- AddForeignKey
ALTER TABLE "WorkerFlat" ADD CONSTRAINT "WorkerFlat_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerFlat" ADD CONSTRAINT "WorkerFlat_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
