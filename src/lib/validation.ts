import { z } from "zod";

// Reusable regex to reject non-printable ASCII control characters (\x00-\x1F, \x7F)
const noControlCharsRegex = /^[^\x00-\x1F\x7F]+$/;
// Allows normal newlines (\r\n) for multiline text (description, address) but rejects other control characters
const multilineCharsRegex = /^[^\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+$/;

/**
 * Validation schema for creating a new Category.
 * Request body: { name, description? }
 */
export const createCategorySchema = z
  .object({
    name: z
      .string({
        error: "Category name must be a string",
      })
      .trim()
      .min(1, "Category name is required")
      .max(100, "Category name cannot exceed 100 characters")
      .regex(noControlCharsRegex, "Category name contains invalid control characters"),
    description: z
      .string()
      .trim()
      .max(500, "Description cannot exceed 500 characters")
      .regex(multilineCharsRegex, "Description contains invalid control characters")
      .optional()
      .nullable(),
  })
  .strict();

/**
 * Validation schema for updating an existing Category.
 * Allows updating name, description, or both.
 */
export const updateCategorySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Category name cannot be empty")
      .max(100, "Category name cannot exceed 100 characters")
      .regex(noControlCharsRegex, "Category name contains invalid control characters")
      .optional(),
    description: z
      .string()
      .trim()
      .max(500, "Description cannot exceed 500 characters")
      .regex(multilineCharsRegex, "Description contains invalid control characters")
      .optional()
      .nullable(),
  })
  .strict()
  .refine(
    (data) => data.name !== undefined || data.description !== undefined,
    {
      message: "At least one field (name or description) must be provided for update",
    }
  );

/**
 * Factory for route-parameter ID schemas (e.g. /api/manufacturers/:id).
 * Coerces the string param from the URL to a positive integer.
 *
 * The label is injected so error messages stay entity-specific even though
 * every entity shares the identical shape (e.g. "Category ID must be a
 * valid number" vs "Manufacturer ID must be a valid number").
 */
export const idParamSchema = (label: string) =>
  z.object({
    id: z.coerce
      .number({
        error: `${label} ID must be a valid number`,
      })
      .int(`${label} ID must be an integer`)
      .positive(`${label} ID must be a positive integer`),
  });

/**
 * Shared schema for GET list endpoints (offset pagination + search).
 *
 * Defaults: page 1, limit 20. Limit is capped at 100 so a caller cannot
 * request an unbounded result set (e.g. ?limit=999999).
 * An empty search string is trimmed to "" and treated as "no filter".
 */
export const paginatedQuerySchema = z.object({
  page: z.coerce
    .number({
      error: "Page must be a valid number",
    })
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .default(1),
  limit: z.coerce
    .number({
      error: "Limit must be a valid number",
    })
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(100, "Limit cannot exceed 100")
    .default(20),
  search: z
    .string()
    .trim()
    .max(100, "Search term cannot exceed 100 characters")
    .optional(),
});

/**
 * Validation schema for creating a new Manufacturer.
 * Request body: { name, phone?, email?, address? }
 *
 * Email uniqueness is enforced at the database level (@unique), so email is
 * normalized to lowercase before storage: PostgreSQL's unique index is
 * case-sensitive, and lowercasing closes the gap where "CEO@PFIZER.com" and
 * "ceo@pfizer.com" could otherwise dodge the constraint.
 */
export const createManufacturerSchema = z
  .object({
    name: z
      .string({
        error: "Manufacturer name must be a string",
      })
      .trim()
      .min(1, "Manufacturer name is required")
      .max(100, "Manufacturer name cannot exceed 100 characters")
      .regex(noControlCharsRegex, "Manufacturer name contains invalid control characters"),
    phone: z
      .string()
      .trim()
      .max(30, "Phone number cannot exceed 30 characters")
      .regex(noControlCharsRegex, "Phone number contains invalid control characters")
      .optional()
      .nullable(),
    email: z
      .string()
      .trim()
      .max(254, "Email cannot exceed 254 characters")
      .pipe(z.email({ error: "Invalid email address" }))
      .optional()
      .nullable(),
    address: z
      .string()
      .trim()
      .max(500, "Address cannot exceed 500 characters")
      .regex(multilineCharsRegex, "Address contains invalid control characters")
      .optional()
      .nullable(),
  })
  .strict();

/**
 * Validation schema for updating an existing Manufacturer.
 * All fields optional; at least one must be provided.
 * Enforces strict keys (rejects unknown properties).
 */
export const updateManufacturerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Manufacturer name cannot be empty")
      .max(100, "Manufacturer name cannot exceed 100 characters")
      .regex(noControlCharsRegex, "Manufacturer name contains invalid control characters")
      .optional(),
    phone: z
      .string()
      .trim()
      .max(30, "Phone number cannot exceed 30 characters")
      .regex(noControlCharsRegex, "Phone number contains invalid control characters")
      .optional()
      .nullable(),
    email: z
      .string()
      .trim()
      .max(254, "Email cannot exceed 254 characters")
      .pipe(z.email({ error: "Invalid email address" }))
      .optional()
      .nullable(),
    address: z
      .string()
      .trim()
      .max(500, "Address cannot exceed 500 characters")
      .regex(multilineCharsRegex, "Address contains invalid control characters")
      .optional()
      .nullable(),
  })
  .strict()
  .refine(
    (data) =>
      data.name !== undefined ||
      data.phone !== undefined ||
      data.email !== undefined ||
      data.address !== undefined,
    {
      message: "At least one field (name, phone, email or address) must be provided for update",
    }
  );

// TypeScript inference types directly from Zod schemas
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type PaginatedQueryInput = z.infer<typeof paginatedQuerySchema>;
export type CreateManufacturerInput = z.infer<typeof createManufacturerSchema>;
export type UpdateManufacturerInput = z.infer<typeof updateManufacturerSchema>;

/**
 * Validation schema for creating a new Supplier.
 * Request body: { name, phone?, email?, address? }
 */
export const createSupplierSchema = z
  .object({
    name: z
      .string({
        error: "Supplier name must be a string",
      })
      .trim()
      .min(1, "Supplier name is required")
      .max(100, "Supplier name cannot exceed 100 characters")
      .regex(noControlCharsRegex, "Supplier name contains invalid control characters"),
    phone: z
      .string()
      .trim()
      .max(30, "Phone number cannot exceed 30 characters")
      .regex(noControlCharsRegex, "Phone number contains invalid control characters")
      .optional()
      .nullable(),
    email: z
      .string()
      .trim()
      .max(254, "Email cannot exceed 254 characters")
      .pipe(z.email({ error: "Invalid email address" }))
      .optional()
      .nullable(),
    address: z
      .string()
      .trim()
      .max(500, "Address cannot exceed 500 characters")
      .regex(multilineCharsRegex, "Address contains invalid control characters")
      .optional()
      .nullable(),
  })
  .strict();

/**
 * Validation schema for updating an existing Supplier.
 * All fields optional; at least one must be provided.
 */
export const updateSupplierSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Supplier name cannot be empty")
      .max(100, "Supplier name cannot exceed 100 characters")
      .regex(noControlCharsRegex, "Supplier name contains invalid control characters")
      .optional(),
    phone: z
      .string()
      .trim()
      .max(30, "Phone number cannot exceed 30 characters")
      .regex(noControlCharsRegex, "Phone number contains invalid control characters")
      .optional()
      .nullable(),
    email: z
      .string()
      .trim()
      .max(254, "Email cannot exceed 254 characters")
      .pipe(z.email({ error: "Invalid email address" }))
      .optional()
      .nullable(),
    address: z
      .string()
      .trim()
      .max(500, "Address cannot exceed 500 characters")
      .regex(multilineCharsRegex, "Address contains invalid control characters")
      .optional()
      .nullable(),
  })
  .strict()
  .refine(
    (data) =>
      data.name !== undefined ||
      data.phone !== undefined ||
      data.email !== undefined ||
      data.address !== undefined,
    {
      message: "At least one field (name, phone, email or address) must be provided for update",
    }
  );

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

/**
 * Validation schema for creating a new Product.
 * Request body: { name, strength?, description?, sellingPrice, barcode?, categoryId, manufacturerId }
 *
 * sellingPrice is a STRING (not number) to avoid IEEE 754 floating-point
 * corruption; it is passed straight to Prisma's Decimal. The regex caps it
 * at DECIMAL(10,2) bounds (max 8 integer digits, max 2 decimals) so overflow
 * never reaches PostgreSQL as a 500.
 *
 * strength defaults to "" (empty string) so the composite unique index
 * (nameLower, strength, manufacturerId) treats missing strengths as equal —
 * PostgreSQL unique indexes treat NULL != NULL, which would let duplicates
 * through. The service layer also normalizes explicit null to "".
 */
export const createProductSchema = z
  .object({
    name: z
      .string({
        error: "Product name must be a string",
      })
      .trim()
      .min(1, "Product name is required")
      .max(200, "Product name cannot exceed 200 characters")
      .regex(noControlCharsRegex, "Product name contains invalid control characters"),
    strength: z
      .string()
      .trim()
      .max(50, "Strength cannot exceed 50 characters")
      .refine((v) => v === "" || noControlCharsRegex.test(v), "Strength contains invalid control characters")
      .optional()
      .nullable(),
    description: z
      .string()
      .trim()
      .max(1000, "Description cannot exceed 1000 characters")
      .regex(multilineCharsRegex, "Description contains invalid control characters")
      .optional()
      .nullable(),
    sellingPrice: z
      .string({
        error: "Selling price must be a string (e.g. \"29.99\")",
      })
      .trim()
      .regex(/^\d{1,8}(\.\d{1,2})?$/, "Selling price must be a valid amount (max 8 digits, up to 2 decimals)")
      .refine((v) => Number(v) > 0, "Selling price must be greater than 0"),
    barcode: z
      .string()
      .trim()
      .max(50, "Barcode cannot exceed 50 characters")
      .refine((v) => v === "" || noControlCharsRegex.test(v), "Barcode contains invalid control characters")
      .optional()
      .nullable(),
    categoryId: z
      .number({
        error: "Category ID must be a valid number",
      })
      .int("Category ID must be an integer")
      .positive("Category ID must be a positive integer"),
    manufacturerId: z
      .number({
        error: "Manufacturer ID must be a valid number",
      })
      .int("Manufacturer ID must be an integer")
      .positive("Manufacturer ID must be a positive integer"),
  })
  .strict();

/**
 * Validation schema for updating an existing Product.
 * All fields optional; at least one must be provided.
 *
 * strength/barcode/description accept null: strength null clears to "",
 * barcode null clears the barcode, description null clears the description.
 * Uniqueness on update requires merging these partial values with the
 * current row (handled in ProductService).
 */
export const updateProductSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Product name cannot be empty")
      .max(200, "Product name cannot exceed 200 characters")
      .regex(noControlCharsRegex, "Product name contains invalid control characters")
      .optional(),
    strength: z
      .string()
      .trim()
      .max(50, "Strength cannot exceed 50 characters")
      .refine((v) => v === "" || noControlCharsRegex.test(v), "Strength contains invalid control characters")
      .optional()
      .nullable(),
    description: z
      .string()
      .trim()
      .max(1000, "Description cannot exceed 1000 characters")
      .regex(multilineCharsRegex, "Description contains invalid control characters")
      .optional()
      .nullable(),
    sellingPrice: z
      .string()
      .trim()
      .regex(/^\d{1,8}(\.\d{1,2})?$/, "Selling price must be a valid amount (max 8 digits, up to 2 decimals)")
      .refine((v) => Number(v) > 0, "Selling price must be greater than 0")
      .optional(),
    barcode: z
      .string()
      .trim()
      .max(50, "Barcode cannot exceed 50 characters")
      .refine((v) => v === "" || noControlCharsRegex.test(v), "Barcode contains invalid control characters")
      .optional()
      .nullable(),
    categoryId: z
      .number({
        error: "Category ID must be a valid number",
      })
      .int("Category ID must be an integer")
      .positive("Category ID must be a positive integer")
      .optional(),
    manufacturerId: z
      .number({
        error: "Manufacturer ID must be a valid number",
      })
      .int("Manufacturer ID must be an integer")
      .positive("Manufacturer ID must be a positive integer")
      .optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.name !== undefined ||
      data.strength !== undefined ||
      data.description !== undefined ||
      data.sellingPrice !== undefined ||
      data.barcode !== undefined ||
      data.categoryId !== undefined ||
      data.manufacturerId !== undefined,
    {
      message:
        "At least one field (name, strength, description, sellingPrice, barcode, categoryId or manufacturerId) must be provided for update",
    }
  );

/**
 * Query schema for GET /api/products.
 * Extends the shared pagination/search schema with FK filters.
 */
export const productQuerySchema = paginatedQuerySchema.extend({
  categoryId: z.coerce
    .number({
      error: "Category ID must be a valid number",
    })
    .int("Category ID must be an integer")
    .positive("Category ID must be a positive integer")
    .optional(),
  manufacturerId: z.coerce
    .number({
      error: "Manufacturer ID must be a valid number",
    })
    .int("Manufacturer ID must be an integer")
    .positive("Manufacturer ID must be a positive integer")
    .optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductQueryInput = z.infer<typeof productQuerySchema>;