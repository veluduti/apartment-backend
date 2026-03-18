/*
  Warnings:

  - You are about to drop the column `userId` on the `Flat` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[flatId]` on the table `WorkerFlat` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Flat_userId_key";

-- DropIndex
DROP INDEX "WorkerFlat_flatId_idx";

-- DropIndex
DROP INDEX "WorkerFlat_workerId_flatId_key";

-- DropIndex
DROP INDEX "WorkerFlat_workerId_idx";

-- AlterTable
ALTER TABLE "Flat" DROP COLUMN "userId";

-- CreateIndex
CREATE UNIQUE INDEX "WorkerFlat_flatId_key" ON "WorkerFlat"("flatId");
