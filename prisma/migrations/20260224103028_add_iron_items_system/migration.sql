-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "totalAmount" INTEGER DEFAULT 0;

-- CreateTable
CREATE TABLE "IronItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "clothType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "pricePerUnit" INTEGER NOT NULL,

    CONSTRAINT "IronItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IronPricing" (
    "id" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "clothType" TEXT NOT NULL,
    "price" INTEGER NOT NULL,

    CONSTRAINT "IronPricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IronItem_requestId_idx" ON "IronItem"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "IronPricing_apartmentId_clothType_key" ON "IronPricing"("apartmentId", "clothType");

-- AddForeignKey
ALTER TABLE "IronItem" ADD CONSTRAINT "IronItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IronPricing" ADD CONSTRAINT "IronPricing_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
