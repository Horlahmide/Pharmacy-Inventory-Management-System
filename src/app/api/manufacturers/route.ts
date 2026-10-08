import { NextRequest, NextResponse } from "next/server";
import { ManufacturerService } from "@/services/Manufacturer.service";
import { createManufacturerSchema, paginatedQuerySchema } from "@/lib/validation";
import { toErrorResponse } from "@/lib/errors";

/**
 * GET /api/manufacturers
 * Retrieves a paginated list of manufacturers.
 *
 * Query params:
 *   page   — 1-based page number (default 1)
 *   limit  — rows per page, 1–100 (default 20)
 *   search — optional case-insensitive partial match on manufacturer name
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
          details: query.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const result = await ManufacturerService.getAll(query.data);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toErrorResponse(error, "Failed to fetch manufacturers");
  }
}

/**
 * POST /api/manufacturers
 * Creates a new manufacturer after validating the request body with Zod.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 1. Zod validation
    const validation = createManufacturerSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    // 2. Business logic & database creation via ManufacturerService
    const manufacturer = await ManufacturerService.create(validation.data);

    return NextResponse.json(manufacturer, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "Failed to create manufacturer");
  }
}