-- AlterTable
ALTER TABLE "Category" ADD COLUMN "nameLower" TEXT;

-- Backfill nameLower from existing name
UPDATE "Category" SET "nameLower" = LOWER("name");

-- Make nameLower NOT NULL
ALTER TABLE "Category" ALTER COLUMN "nameLower" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Category_nameLower_key" ON "Category"("nameLower");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
