-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "flatNumber" TEXT;

-- CreateIndex
CREATE INDEX "ServiceRequest_createdAt_idx" ON "ServiceRequest"("createdAt");
