import { z } from "zod";

/**
 * Validation schema for creating a new Category.
 * Request body: { name, description? }
 */
export const createCategorySchema = z.object({
  name: z
    .string({
      error: "Category name must be a string",
    })
    .trim()
    .min(1, "Category name is required")
    .max(100, "Category name cannot exceed 100 characters"),
  description: z
    .string()
    .trim()
    .max(500, "Description cannot exceed 500 characters")
    .optional()
    .nullable(),
});

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
      .optional(),
    description: z
      .string()
      .trim()
      .max(500, "Description cannot exceed 500 characters")
      .optional()
      .nullable(),
  })
  .refine(
    (data) => data.name !== undefined || data.description !== undefined,
    {
      message: "At least one field (name or description) must be provided for update",
    }
  );

/**
 * Validation schema for route parameters that include an ID (e.g., /api/categories/:id).
 * Coerces the string param from the URL to a positive integer.
 */
export const categoryIdParamSchema = z.object({
  id: z.coerce
    .number({
      error: "Category ID must be a valid number",
    })
    .int("Category ID must be an integer")
    .positive("Category ID must be a positive integer"),
});

// TypeScript inference types directly from Zod schemas
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
