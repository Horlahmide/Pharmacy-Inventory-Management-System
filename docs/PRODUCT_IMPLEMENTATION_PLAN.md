# Product Management API — Implementation Plan

> **Decision Date**: October 14, 2026
> **Status**: Approved — Ready for implementation
> **Previous Milestones**: Category ✅ → Manufacturer ✅ → Supplier ✅

---

## Table of Contents

1. [Why Product Is Different](#1-why-product-is-different)
2. [Current Schema](#2-current-schema)
3. [Schema Changes Required](#3-schema-changes-required)
4. [API Endpoints](#4-api-endpoints)
5. [Field-by-Field Validation Rules](#5-field-by-field-validation-rules)
6. [Edge Cases & Solutions](#6-edge-cases--solutions)
7. [GET Filtering & Search Strategy](#7-get-filtering--search-strategy)
8. [Security Measures](#8-security-measures)
9. [Deferred Features](#9-deferred-features-not-implementing-now)
10. [What Can Break & Fixes](#10-what-can-break-during-implementation--fixes)
11. [File Plan](#11-file-plan)
12. [Implementation Order](#12-implementation-order)

---

## 1. Why Product Is Different

Category, Manufacturer, and Supplier were **independent** entities — no foreign keys,
simple string fields, straightforward name uniqueness.

Product is our **first dependent entity**. It introduces five new complexities:

| # | Complexity | Why It Matters |
|---|---|---|
| 1 | **Foreign keys** (`categoryId`, `manufacturerId`) | Must reference rows that actually exist — needs FK validation |
| 2 | **Decimal money field** (`sellingPrice`) | JavaScript floating-point traps (`0.1 + 0.2 ≠ 0.3`) |
| 3 | **Optional unique field** (`barcode`) | NULL uniqueness semantics in PostgreSQL |
| 4 | **Pharmacy-specific field** (`strength`) | "500mg", "10mg/ml" — part of composite uniqueness |
| 5 | **Two child relations** (`Batch[]`, `SaleItem[]`) | Deletion guards needed from both sides |

---

## 2. Current Schema

```prisma
model Product {
  id           Int     @id @default(autoincrement())
  name         String
  strength     String?
  description  String?
  sellingPrice Decimal @db.Decimal(10, 2)
  barcode      String? @unique

  categoryId     Int
  manufacturerId Int

  category     Category     @relation(fields: [categoryId], references: [id])
  manufacturer Manufacturer @relation(fields: [manufacturerId], references: [id])
  batches      Batch[]
  saleItems    SaleItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([manufacturerId])
  @@index([categoryId])
}
```

---

## 3. Schema Changes Required

### 3.1 Add `nameLower` Column

```prisma
nameLower String
```

**Purpose**: Enables case-insensitive search on product names using a simple
`contains` filter on an indexed column, instead of relying on `mode: insensitive`
which cannot use B-Tree indexes.

Unlike Category/Manufacturer/Supplier, `nameLower` is **NOT** independently unique
here. "Paracetamol" can appear dozens of times from different manufacturers and
strengths. Only the **composite** is unique.

### 3.2 Add Composite Unique Index

```prisma
@@unique([nameLower, strength, manufacturerId])
```

**Business rule (agreed)**: The same manufacturer cannot produce two products
with identical name and strength.

- ✅ "Amoxicillin 500mg" from **Pfizer** AND "Amoxicillin 500mg" from **Emzor** → allowed (different manufacturers)
- ✅ "Amoxicillin 500mg" from Pfizer AND "Amoxicillin 250mg" from Pfizer → allowed (different strengths)
- ❌ "Amoxicillin 500mg" from Pfizer AND "Amoxicillin 500mg" from Pfizer → rejected (duplicate)

### 3.3 Add Search Index

```prisma
@@index([nameLower])
```

**Purpose**: Fast partial-match queries when searching by product name.

### 3.4 Strength NULL → Empty String Normalization (Agreed)

PostgreSQL's unique indexes treat `NULL ≠ NULL`. Without normalization, the
composite unique `(nameLower, strength, manufacturerId)` would allow duplicates
when `strength` is `null`:

```
("bandage", NULL, 1)  -- allowed
("bandage", NULL, 1)  -- ALSO allowed (NULL ≠ NULL)
```

**Solution**: Normalize `null` / missing `strength` to `""` (empty string)
before storage. The Zod schema handles this with `.default("")` so it's
transparent to the service layer.

### 3.5 Migration Strategy

Since products may already exist in the database:

```sql
-- Step 1: Add nameLower as nullable
ALTER TABLE "Product" ADD COLUMN "nameLower" TEXT;

-- Step 2: Backfill from existing name values
UPDATE "Product" SET "nameLower" = LOWER("name");

-- Step 3: Normalize NULL strength to empty string
UPDATE "Product" SET "strength" = '' WHERE "strength" IS NULL;

-- Step 4: Set NOT NULL
ALTER TABLE "Product" ALTER COLUMN "nameLower" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "strength" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "strength" SET DEFAULT '';

-- Step 5: Create indexes
CREATE UNIQUE INDEX "Product_nameLower_strength_manufacturerId_key"
  ON "Product"("nameLower", "strength", "manufacturerId");
CREATE INDEX "Product_nameLower_idx" ON "Product"("nameLower");
```

---

## 4. API Endpoints

| Method | Route | Purpose | Status Code |
|---|---|---|---|
| `GET` | `/api/products` | Paginated list with search & filters | 200 |
| `POST` | `/api/products` | Create a new product | 201 |
| `GET` | `/api/products/:id` | Get single product with category & manufacturer | 200 |
| `PUT` | `/api/products/:id` | Update a product | 200 |
| `DELETE` | `/api/products/:id` | Delete (if no batches/sales) | 200 |

**Method enforcement** (same pattern as previous entities):
- Collection route (`/api/products`): `PUT`, `PATCH`, `DELETE` → 405
- Detail route (`/api/products/:id`): `POST`, `PATCH` → 405

---

## 5. Field-by-Field Validation Rules

### 5.1 `name` (required)

| Rule | Value |
|---|---|
| Type | `string` |
| Trim | `.trim()` |
| Min length | 1 (cannot be empty) |
| Max length | 200 (pharmacy names can be long, e.g. "Amoxicillin/Clavulanic Acid Oral Suspension") |
| Sanitize | `noControlCharsRegex` |

### 5.2 `strength` (optional → defaults to `""`)

| Rule | Value |
|---|---|
| Type | `string` |
| Trim | `.trim()` |
| Default | `""` (empty string, for composite uniqueness) |
| Max length | 50 |
| Sanitize | `noControlCharsRegex` |
| Examples | "500mg", "250mg/5ml", "0.5%", "100IU/ml" |

### 5.3 `description` (optional, nullable)

| Rule | Value |
|---|---|
| Type | `string` or `null` |
| Trim | `.trim()` |
| Max length | 1000 |
| Sanitize | `multilineCharsRegex` (allows newlines) |

### 5.4 `sellingPrice` (required — MONEY FIELD)

| Rule | Value |
|---|---|
| Type | `string` (NOT number — avoids floating-point corruption) |
| Format | `/^\d{1,8}(\.\d{1,2})?$/` |
| Min value | > 0 (must be positive) |
| Max value | 99999999.99 (fits `DECIMAL(10,2)`) |

**Why string?** JavaScript `number` uses IEEE 754 floating point:
```js
0.1 + 0.2 === 0.30000000000000004  // true — this is the bug
```
By accepting `sellingPrice` as `"29.99"` (string), we pass it directly to
Prisma's Decimal without floating-point conversion. This is standard practice
for financial fields in JSON APIs.

### 5.5 `barcode` (optional, nullable, unique when present)

| Rule | Value |
|---|---|
| Type | `string` or `null` |
| Trim | `.trim()` |
| Max length | 50 (EAN-13 is 13 chars, but custom codes exist) |
| Sanitize | `noControlCharsRegex` |
| Uniqueness | Enforced when non-null; multiple `null` barcodes allowed |

### 5.6 `categoryId` (required)

| Rule | Value |
|---|---|
| Type | `number` (positive integer) |
| FK validation | Must reference an existing Category (checked in service layer) |

### 5.7 `manufacturerId` (required)

| Rule | Value |
|---|---|
| Type | `number` (positive integer) |
| FK validation | Must reference an existing Manufacturer (checked in service layer) |

---

## 6. Edge Cases & Solutions

### Edge Case 1: Non-Existent Category or Manufacturer

**Problem**: Client sends `{ "categoryId": 999 }` but Category 999 doesn't exist.

**What breaks without a fix**: Prisma throws `P2003` (foreign key constraint
violation) → `toErrorResponse` catches it, but the generic message ("this record
is referenced by other data") is confusing because it's designed for deletes.

**Fix**: Pre-check existence in the service layer before the create/update:

```typescript
const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
if (!category) {
  throw new AppError("BAD_REQUEST", `Category with ID ${input.categoryId} not found`);
}
```

The DB constraint still acts as the final safety net for race conditions.

---

### Edge Case 2: Duplicate Product (Same Name + Strength + Manufacturer)

**Problem**: Two staff members simultaneously add "Amoxicillin 500mg" from Manufacturer #3.

**Fix** (two layers):
1. **Application pre-check**: `assertProductUnique()` — gives a clear error message
2. **Database composite unique index**: `@@unique([nameLower, strength, manufacturerId])` — catches race conditions
3. `toErrorResponse` maps `P2002` → `409 Conflict`

---

### Edge Case 3: Barcode Collision

**Problem**: Client sends a barcode already used by another product.

**Fix** (two layers):
1. Application pre-check: `assertBarcodeAvailable(barcode, excludeId?)`
2. Database `@unique` on barcode catches concurrent races
3. `P2002` → `409`

**NULL barcodes**: Multiple products can have `barcode = null` — PostgreSQL
unique indexes treat NULLs as distinct. This is correct behavior since not
every product has a barcode.

---

### Edge Case 4: Selling Price Overflow

**Problem**: Client sends `"sellingPrice": "123456789.99"` (9 digits before decimal),
exceeding `DECIMAL(10,2)`.

**What breaks without a fix**: PostgreSQL throws "numeric field overflow" →
Prisma wraps it as a generic error → 500 Internal Server Error.

**Fix**: Validate format in Zod with regex `/^\d{1,8}(\.\d{1,2})?$/`:
- Max 8 digits before decimal
- Max 2 digits after
- Rejects negative numbers, letters, and overflow values

---

### Edge Case 5: Deleting a Product With Batches or Sales

**Problem**: Product #5 has 3 stock batches. Staff tries to delete it.

**Fix**: Check both child tables before deletion:

```typescript
const batchCount = await prisma.batch.count({ where: { productId: id } });
if (batchCount > 0) {
  throw new AppError("BAD_REQUEST",
    `Cannot delete: linked to ${batchCount} batch(es). Remove batches first.`);
}

const saleItemCount = await prisma.saleItem.count({ where: { productId: id } });
if (saleItemCount > 0) {
  throw new AppError("BAD_REQUEST",
    `Cannot delete: linked to ${saleItemCount} sale record(s).`);
}
```

---

### Edge Case 6: Updating FK to a Non-Existent ID

**Problem**: `PUT /api/products/5` with `{ "manufacturerId": 999 }` where 999
doesn't exist.

**Fix**: Only validate the FK that's being changed:

```typescript
if (input.categoryId !== undefined) {
  // verify new categoryId exists
}
if (input.manufacturerId !== undefined) {
  // verify new manufacturerId exists
}
```

---

### Edge Case 7: Update That Creates a Composite Duplicate

**Problem**: Updating a product's name to match another product that already has
the same strength and manufacturer.

**Fix**: The uniqueness check on update must:
1. Fetch the **current** product (to get unchanged fields)
2. Merge current values with incoming values
3. Run the composite check excluding the current row's ID

```typescript
// Client sends only { "name": "NewName" }
// Must check uniqueness of (NewName, currentStrength, currentManufacturerId)
await this.assertProductUnique(
  input.name ?? currentProduct.name,
  input.strength ?? currentProduct.strength,
  input.manufacturerId ?? currentProduct.manufacturerId,
  id  // exclude self
);
```

This is the trickiest part of the update logic — partial payloads require
merging with existing data before uniqueness checking.

---

## 7. GET Filtering & Search Strategy

Products need richer filtering than our previous entities:

### Query Parameters

| Param | Type | Default | Purpose |
|---|---|---|---|
| `page` | int | 1 | Page number (offset pagination) |
| `limit` | int | 20 (max 100) | Results per page |
| `search` | string | — | Case-insensitive partial match on product name |
| `categoryId` | int | — | Filter by category |
| `manufacturerId` | int | — | Filter by manufacturer |

**Real-world use cases** these filters serve:
- "Show me all **Antibiotics**" → `?categoryId=3`
- "Show me everything from **Pfizer**" → `?manufacturerId=7`
- "Search for **amoxicillin**" → `?search=amoxicillin`
- Combined: "Pfizer antibiotics" → `?categoryId=3&manufacturerId=7`

### Response Shape

Include related entity names so the frontend doesn't need extra API calls:

```json
{
  "data": [
    {
      "id": 1,
      "name": "Amoxicillin",
      "nameLower": "amoxicillin",
      "strength": "500mg",
      "description": "Broad-spectrum antibiotic",
      "sellingPrice": "29.99",
      "barcode": "8901234567890",
      "categoryId": 3,
      "manufacturerId": 7,
      "category": { "id": 3, "name": "Antibiotics" },
      "manufacturer": { "id": 7, "name": "Pfizer" },
      "_count": { "batches": 5, "saleItems": 12 },
      "createdAt": "2026-10-14T14:00:00.000Z",
      "updatedAt": "2026-10-14T14:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 150,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

### Zod Schema for Query Params

Extends `paginatedQuerySchema` with product-specific filters:

```typescript
export const productQuerySchema = paginatedQuerySchema.extend({
  categoryId: z.coerce.number().int().positive().optional(),
  manufacturerId: z.coerce.number().int().positive().optional(),
});
```

---

## 8. Security Measures

Same hardening pattern established in previous entities:

| Measure | How |
|---|---|
| **Payload size guard** | `readJsonBody(request, 16 * 1024)` — 16 KB cap |
| **Mass-assignment prevention** | `.strict()` on Zod schemas — unknown keys → 400 |
| **Control character sanitization** | `noControlCharsRegex` / `multilineCharsRegex` on all strings |
| **Method enforcement** | Explicit 405 handlers with `Allow` header |
| **ID parameter validation** | `parseIdParam(context.params, "product")` |
| **Error information leakage** | All errors through `toErrorResponse()` — no internals leaked |
| **Pagination cap** | `limit` max 100, prevents unbounded result sets |
| **Search term cap** | `search` max 100 chars |
| **FK existence validation** | Prevents invalid references with clear error messages |

---

## 9. Deferred Features (Not Implementing Now)

| Feature | Reason for Deferral | When to Add |
|---|---|---|
| **Authentication** | Dedicated auth milestone | Before production |
| **Rate limiting** | Paired with auth | Before production |
| **Product images** | Needs file storage (S3/Cloudinary) | After core CRUD complete |
| **Bulk import** (CSV/Excel) | Complex, not core CRUD | After all entities done |
| **Stock quantity on Product** | Stock lives on Batch via InventoryMovement | Not needed — by design |
| **Price history** | Needs `PriceHistory` model | After MVP, if needed |
| **Product status** (active/discontinued) | Needs enum field, schema change | Schema evolution phase |
| **Full-text search** (`pg_trgm`) | Overkill for < 10K products | When catalog grows large |
| **Keyset/cursor pagination** | Overkill for Product volume | Reserved for InventoryMovement/SaleItem |

---

## 10. What Can Break During Implementation & Fixes

### Break 1: Prisma Decimal Serialization

**Problem**: Prisma returns `Decimal` objects, not plain numbers. If you try
arithmetic on them in JavaScript, they behave as objects, not numbers.

**Fix**: Don't touch the Decimal in JS. Accept as string from client → store as
Decimal → return as-is (Prisma serializes it correctly to JSON as a string).

### Break 2: Migration on Existing Data

**Problem**: Adding `nameLower` as NOT NULL on a table with existing rows fails
because the column has no default.

**Fix**: Three-step migration (same as Manufacturer/Supplier):
1. Add as nullable
2. Backfill: `UPDATE "Product" SET "nameLower" = LOWER("name")`
3. Alter to NOT NULL

### Break 3: Strength Column Change (nullable → NOT NULL with default)

**Problem**: Existing products may have `strength = NULL`. Changing the column
to NOT NULL would fail.

**Fix**: Backfill nulls first:
```sql
UPDATE "Product" SET "strength" = '' WHERE "strength" IS NULL;
ALTER TABLE "Product" ALTER COLUMN "strength" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "strength" SET DEFAULT '';
```

### Break 4: Update Uniqueness Requires Current State

**Problem**: When checking composite uniqueness on update, we need the *current*
values for fields the client didn't send in the partial payload.

**Fix**: Fetch the product first (existence check already does this), then merge
current values with incoming values before the uniqueness assertion.

---

## 11. File Plan

| File | Action | Purpose |
|---|---|---|
| `prisma/schema.prisma` | **Edit** | Add `nameLower`, change `strength` default, add composite unique + search index |
| `prisma/migrations/...` | **Generate** | Migration with backfill SQL |
| `src/lib/validation.ts` | **Edit** | Add `createProductSchema`, `updateProductSchema`, `productQuerySchema` |
| `src/services/Product.service.ts` | **Create** | CRUD, FK validation, composite uniqueness, barcode uniqueness, delete guards |
| `src/app/api/products/route.ts` | **Create** | `GET` (paginated list) and `POST` (create) |
| `src/app/api/products/[id]/route.ts` | **Create** | `GET` (detail), `PUT` (update), `DELETE` |

---

## 12. Implementation Order

| Step | What | Depends On |
|---|---|---|
| 1 | Schema migration (nameLower, strength default, composite unique) | — |
| 2 | Zod validation schemas in `validation.ts` | Step 1 (schema finalized) |
| 3 | `ProductService` with all business logic | Step 2 (types from schemas) |
| 4 | Route handlers (`/api/products`, `/api/products/[id]`) | Step 3 (service layer) |
| 5 | Manual testing via PowerShell | Step 4 (routes exist) |

---

## Appendix: Comparison With Previous Entities

| Aspect | Category / Manufacturer / Supplier | Product |
|---|---|---|
| Foreign keys | None | `categoryId`, `manufacturerId` |
| Uniqueness | Simple `nameLower @unique` | Composite `@@unique([nameLower, strength, manufacturerId])` |
| Money field | None | `sellingPrice` as `Decimal(10,2)` |
| Optional unique field | None (Manufacturer/Supplier have `email?`) | `barcode` (null-safe) |
| Deletion guards | 1 child table each | 2 child tables (`Batch` + `SaleItem`) |
| Search filters | Name only | Name + `categoryId` + `manufacturerId` |
| FK validation needed | No | Yes — must verify Category & Manufacturer exist |
| NULL normalization | None | `strength: null` → `""` for composite uniqueness |

---

## Appendix: Deviations From This Plan (As Implemented)

> **Date**: October 14, 2026
> **Status**: Implemented and verified (86/86 live checks)

These are the places where the shipped code is **intentionally different** from
what the sections above literally describe. Each entry lists: what this document
said, what was actually built, why, and whether the API contract changes.

### Deviation 1 — `strength: null` → `""` is done in the service, not via `.default("")`

| | |
|---|---|
| **Plan said** | Normalize `null`/missing `strength` to `""` using `.default("")` so it is "transparent to the service layer" (§3.4, §5.2). |
| **Implemented** | The Zod field is `.optional().nullable()`; the service normalizes with `input.strength ?? ""`. |
| **Why** | `.default("")` only runs when the key is **missing** (`undefined`). It does **not** run for an explicit `"strength": null` — `null` is a value, so the default is skipped and the raw `null` would flow into a `NOT NULL` column and fail. `?? ""` handles **both** `undefined` and `null` in one spot. |
| **Contract impact** | None. Both missing and explicit-null strength store `""`. A hole the plan's approach would have left open is closed. |

### Deviation 2 — `barcode: ""` is stored as `null`

| | |
|---|---|
| **Plan said** | Barcode is optional, nullable, unique when present (§5.5). Nothing about empty string. |
| **Implemented** | An empty/blank barcode is saved as `null`. |
| **Why** | `""` is not a real barcode, and `@unique` treats `""` as a real value — so **two** blank-barcode products would collide (409), while two `null`s are correctly allowed (PostgreSQL: NULL ≠ NULL). |
| **Contract impact** | "No barcode" is always represented as `null`; unlimited products may omit a barcode. |

### Deviation 3 — `sellingPrice` must be strictly greater than 0

| | |
|---|---|
| **Plan said** | Format `/^\d{1,8}(\.\d{1,2})?$/` **and** "Min value > 0" (§5.4). |
| **Implemented** | The regex **plus** `.refine(v => Number(v) > 0)`. |
| **Why** | The plan's regex only checks *shape* and happily matches `"0"` and `"0.00"`. The "must be positive" rule was never actually enforced by the plan's own regex. The refine enforces it. (`Number()` is used only for the comparison; the stored value stays a string.) |
| **Contract impact** | `"0"` / `"0.00"` now return **400** instead of silently creating a ₦0 product. |

### Deviation 4 — Explicit `""` is accepted for `strength` and `barcode`

| | |
|---|---|
| **Plan said** | Sanitize both with `noControlCharsRegex` (§5.2, §5.5). |
| **Implemented** | A refine that allows `""` **or** passes the control-character check, instead of the raw regex. |
| **Why** | `noControlCharsRegex` = `/^[^\x00-\x1F\x7F]+$/` — the `+` requires **at least one character**, so `""` fails it. Live testing showed `"strength": ""` returned `400 "Strength contains invalid control characters"` — the plan's own schema, but a misleading message (there are no control characters in an empty string). |
| **Contract impact** | `""` now means "no strength" (`""`) / "no barcode" (`null`), matching how clients clear optional fields. To reverse this, reject `""` with a "cannot be empty" message instead. |

### Deviation 5 — `sellingPrice` echoes `"10.5"`, not `"10.50"` (discovered, not changed)

| | |
|---|---|
| **Plan said** | Accept as string → store as Decimal → "return as-is (Prisma serializes it correctly to JSON as a string)" (Break 1). |
| **Implemented** | No code change — this is a behavior of Prisma's `Decimal`. Input `"10.50"` comes back as the JSON **string** `"10.5"`. |
| **Why** | `Decimal`/`decimal.js` normalizes the number and drops the trailing zero. Crucially it stays a **string**, not a JSON number — so the float-safety goal of Break 1 still holds. |
| **Contract impact** | Frontend should format currency for display (e.g. `toFixed(2)`) rather than trusting the raw decimals. Input validation is unchanged (string, ≤2 decimals). |

### Test-fixture note (not a plan deviation)

`Employee.updatedAt` is a Prisma `@updatedAt` field, which is populated by the
**client**, not the database. Any raw-SQL test fixture inserting an `Employee`
row must set `"updatedAt"` explicitly. This affects only test setup, not
production code.
