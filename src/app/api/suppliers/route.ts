import { NextRequest, NextResponse } from "next/server";
import { SupplierService } from "@/services/Supplier.service";
import { createSupplierSchema, paginatedQuerySchema } from "@/lib/validation";
import { toErrorResponse, readJsonBody, validationErrorDetails, methodNotAllowedResponse } from "@/lib/errors";

/**
 * GET /api/suppliers
 * Retrieves a paginated list of suppliers.
 *
 * Query params:
 *   page   — 1-based page number (default 1)
 *   limit  — rows per page, 1–100 (default 20)
 *   search — optional case-insensitive partial match on supplier name
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

    const result = await SupplierService.getAll(query.data);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toErrorResponse(error, "Failed to fetch suppliers");
  }
}

/**
 * POST /api/suppliers
 * Creates a new supplier after validating the request body with Zod.
 * Protected by 16 KB payload guard.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);

    // 1. Zod validation
    const validation = createSupplierSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: validationErrorDetails(validation.error),
        },
        { status: 400 }
      );
    }

    // 2. Business logic & database creation via SupplierService
    const supplier = await SupplierService.create(validation.data);

    return NextResponse.json(supplier, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "Failed to create supplier");
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
