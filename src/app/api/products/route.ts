import { NextRequest, NextResponse } from "next/server";
import { ProductService } from "@/services/Product.service";
import { createProductSchema, productQuerySchema } from "@/lib/validation";
import {
  toErrorResponse,
  readJsonBody,
  validationErrorDetails,
  methodNotAllowedResponse,
} from "@/lib/errors";

/**
 * GET /api/products
 * Retrieves a paginated list of products.
 *
 * Query params:
 *   page           — 1-based page number (default 1)
 *   limit          — rows per page (1–100, default 20)
 *   search         — optional case-insensitive partial match on product name
 *   categoryId     — optional filter by category
 *   manufacturerId — optional filter by manufacturer
 *
 * Response: { data, pagination } with category/manufacturer names included.
 */
export async function GET(request: NextRequest) {
  try {
    const query = productQuerySchema.safeParse(
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

    const result = await ProductService.getAll(query.data);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toErrorResponse(error, "Failed to fetch products");
  }
}

/**
 * POST /api/products
 * Creates a new product after validating the request body with Zod.
 * Protected by 16 KB payload guard.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);

    // 1. Zod validation
    const validation = createProductSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: validationErrorDetails(validation.error),
        },
        { status: 400 }
      );
    }

    // 2. Business logic & database creation via ProductService
    const product = await ProductService.create(validation.data);

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "Failed to create product");
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
