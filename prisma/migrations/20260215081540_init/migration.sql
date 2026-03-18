-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "workerId" TEXT;

-- CreateIndex
CREATE INDEX "ServiceRequest_apartmentId_idx" ON "ServiceRequest"("apartmentId");

-- CreateIndex
CREATE INDEX "ServiceRequest_residentId_idx" ON "ServiceRequest"("residentId");

-- CreateIndex
CREATE INDEX "ServiceRequest_workerId_idx" ON "ServiceRequest"("workerId");

-- CreateIndex
CREATE INDEX "ServiceRequest_status_idx" ON "ServiceRequest"("status");

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
