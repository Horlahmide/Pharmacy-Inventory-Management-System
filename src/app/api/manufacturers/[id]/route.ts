import { NextRequest, NextResponse } from "next/server";
import { ManufacturerService } from "@/services/Manufacturer.service";
import { updateManufacturerSchema } from "@/lib/validation";
import { toErrorResponse, parseIdParam } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/manufacturers/:id
 * Retrieves a single manufacturer by ID.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const parsed = await parseIdParam(context.params, "manufacturer");
    if (!parsed.success) return parsed.response;

    const manufacturer = await ManufacturerService.getById(parsed.id);
    return NextResponse.json(manufacturer, { status: 200 });
  } catch (error) {
    return toErrorResponse(error, "Failed to get manufacturer");
  }
}

/**
 * PUT /api/manufacturers/:id
 * Updates an existing manufacturer.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const parsed = await parseIdParam(context.params, "manufacturer");
    if (!parsed.success) return parsed.response;

    const body = await request.json();
    const validation = updateManufacturerSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const updated = await ManufacturerService.update(parsed.id, validation.data);
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return toErrorResponse(error, "Failed to update manufacturer");
  }
}

/**
 * DELETE /api/manufacturers/:id
 * Deletes a manufacturer if no products are associated with it.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const parsed = await parseIdParam(context.params, "manufacturer");
    if (!parsed.success) return parsed.response;

    await ManufacturerService.delete(parsed.id);
    return NextResponse.json(
      { message: "Manufacturer deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    return toErrorResponse(error, "Failed to delete manufacturer");
  }
}