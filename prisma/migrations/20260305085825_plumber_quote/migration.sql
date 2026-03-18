-- CreateTable
CREATE TABLE "PlumberQuote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "visitCharge" INTEGER NOT NULL,
    "materialCharge" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlumberQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlumberQuote_requestId_key" ON "PlumberQuote"("requestId");

-- AddForeignKey
ALTER TABLE "PlumberQuote" ADD CONSTRAINT "PlumberQuote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
