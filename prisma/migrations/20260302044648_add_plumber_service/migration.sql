-- CreateTable
CREATE TABLE "PlumberDetails" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "problemTitle" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "visitCharge" INTEGER,
    "materialCharge" INTEGER,
    "finalAmount" INTEGER,
    "residentApproved" BOOLEAN NOT NULL DEFAULT false,
    "photos" TEXT[],

    CONSTRAINT "PlumberDetails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlumberDetails_requestId_key" ON "PlumberDetails"("requestId");

-- AddForeignKey
ALTER TABLE "PlumberDetails" ADD CONSTRAINT "PlumberDetails_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
