-- Add Product.nameLower (case-insensitive search + composite uniqueness member)
-- 1. Add as nullable so existing rows can be backfilled before NOT NULL
ALTER TABLE "Product" ADD COLUMN "nameLower" TEXT;

-- 2. Backfill from existing name values
UPDATE "Product" SET "nameLower" = LOWER("name");

-- 3. Normalize NULL strength to empty string (PostgreSQL unique indexes treat NULL != NULL,
--    which would otherwise let duplicate (name, NULL, manufacturer) rows through)
UPDATE "Product" SET "strength" = '' WHERE "strength" IS NULL;

-- 4. Enforce NOT NULL (and default for future inserts)
ALTER TABLE "Product" ALTER COLUMN "nameLower" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "strength" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "strength" SET DEFAULT '';

-- 5. Composite unique: same manufacturer cannot produce two products with
--    identical name + strength (case-insensitive on name)
CREATE UNIQUE INDEX "Product_nameLower_strength_manufacturerId_key"
  ON "Product"("nameLower", "strength", "manufacturerId");

-- 6. Search index for fast partial-match queries on product name
CREATE INDEX "Product_nameLower_idx" ON "Product"("nameLower");
