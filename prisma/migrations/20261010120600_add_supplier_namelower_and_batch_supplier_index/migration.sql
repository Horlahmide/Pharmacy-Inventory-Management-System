-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN "nameLower" TEXT;

-- Backfill nameLower from existing name
UPDATE "Supplier" SET "nameLower" = LOWER("name");

-- Make nameLower NOT NULL
ALTER TABLE "Supplier" ALTER COLUMN "nameLower" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_nameLower_key" ON "Supplier"("nameLower");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_email_key" ON "Supplier"("email");

-- CreateIndex
CREATE INDEX "Batch_supplierId_idx" ON "Batch"("supplierId");
