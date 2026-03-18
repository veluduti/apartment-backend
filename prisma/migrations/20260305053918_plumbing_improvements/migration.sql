-- AlterTable
ALTER TABLE "PlumberDetails" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "estimatedDuration" INTEGER;

-- CreateIndex
CREATE INDEX "Payment_residentId_idx" ON "Payment"("residentId");

-- CreateIndex
CREATE INDEX "Payment_workerId_idx" ON "Payment"("workerId");

-- CreateIndex
CREATE INDEX "ServiceRequest_serviceType_idx" ON "ServiceRequest"("serviceType");
