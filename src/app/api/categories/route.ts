import { NextRequest, NextResponse } from "next/server";
import { CategoryService } from "@/services/Category.service";
import { createCategorySchema, paginatedQuerySchema } from "@/lib/validation";
import { toErrorResponse, readJsonBody, validationErrorDetails, methodNotAllowedResponse } from "@/lib/errors";

/**
 * GET /api/categories
 * Retrieves a paginated list of product categories.
 *
 * Query params:
 *   page   — 1-based page number (default 1)
 *   limit  — rows per page, 1–100 (default 20)
 *   search — optional case-insensitive partial match on category name
 *
 * Response: { data, pagination }
 */
export async function GET(request: NextRequest) {
  try {
    const query = paginatedQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams)
    );

    if (!query.success) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: validationErrorDetails(query.error),
        },
        { status: 400 }
      );
    }

    const result = await CategoryService.getAll(query.data);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toErrorResponse(error, "Failed to fetch categories");
  }
}

/**
 * POST /api/categories
 * Creates a new category after validating the request body with Zod.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);

    // 1. Zod validation
    const validation = createCategorySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: validationErrorDetails(validation.error),
        },
        { status: 400 }
      );
    }

    // 2. Business logic & database creation via CategoryService
    const category = await CategoryService.create(validation.data);

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "Failed to create category");
  }
}

/** PUT is not implemented on the collection route. */
export function PUT() {
  return methodNotAllowedResponse(["GET", "POST"]);
}

/** PATCH is not implemented on the collection route. */
export function PATCH() {
  return methodNotAllowedResponse(["GET", "POST"]);
}

/** DELETE requires a specific :id; deleting the whole collection is not allowed. */
export function DELETE() {
  return methodNotAllowedResponse(["GET", "POST"]);
}
