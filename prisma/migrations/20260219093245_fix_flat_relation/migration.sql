/*
  Warnings:

  - A unique constraint covering the columns `[flatId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Apartment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "blockId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "flatId" TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WorkerProfile" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flat" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerBlock" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,

    CONSTRAINT "WorkerBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Block_apartmentId_idx" ON "Block"("apartmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Block_name_apartmentId_key" ON "Block"("name", "apartmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Flat_userId_key" ON "Flat"("userId");

-- CreateIndex
CREATE INDEX "Flat_blockId_idx" ON "Flat"("blockId");

-- CreateIndex
CREATE UNIQUE INDEX "Flat_number_blockId_key" ON "Flat"("number", "blockId");

-- CreateIndex
CREATE INDEX "WorkerBlock_workerId_idx" ON "WorkerBlock"("workerId");

-- CreateIndex
CREATE INDEX "WorkerBlock_blockId_idx" ON "WorkerBlock"("blockId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerBlock_workerId_blockId_key" ON "WorkerBlock"("workerId", "blockId");

-- CreateIndex
CREATE INDEX "ServiceRequest_blockId_idx" ON "ServiceRequest"("blockId");

-- CreateIndex
CREATE UNIQUE INDEX "User_flatId_key" ON "User"("flatId");

-- CreateIndex
CREATE INDEX "User_apartmentId_idx" ON "User"("apartmentId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flat" ADD CONSTRAINT "Flat_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerBlock" ADD CONSTRAINT "WorkerBlock_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerBlock" ADD CONSTRAINT "WorkerBlock_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE SET NULL ON UPDATE CASCADE;
