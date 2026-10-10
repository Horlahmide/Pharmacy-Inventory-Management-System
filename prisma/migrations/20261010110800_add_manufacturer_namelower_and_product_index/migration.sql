-- AlterTable
ALTER TABLE "Manufacturer" ADD COLUMN "nameLower" TEXT;

-- Backfill nameLower from existing name
UPDATE "Manufacturer" SET "nameLower" = LOWER("name");

-- Make nameLower NOT NULL
ALTER TABLE "Manufacturer" ALTER COLUMN "nameLower" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_nameLower_key" ON "Manufacturer"("nameLower");

-- CreateIndex
CREATE INDEX "Product_manufacturerId_idx" ON "Product"("manufacturerId");
