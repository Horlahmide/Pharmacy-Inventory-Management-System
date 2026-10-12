import { NextRequest, NextResponse } from "next/server";
import { SupplierService } from "@/services/Supplier.service";
import { updateSupplierSchema } from "@/lib/validation";
import { toErrorResponse, parseIdParam, readJsonBody, validationErrorDetails, methodNotAllowedResponse } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/suppliers/:id
 * Retrieves a single supplier by ID.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const parsed = await parseIdParam(context.params, "supplier");
    if (!parsed.success) return parsed.response;

    const supplier = await SupplierService.getById(parsed.id);
    return NextResponse.json(supplier, { status: 200 });
  } catch (error) {
    return toErrorResponse(error, "Failed to get supplier");
  }
}

/**
 * PUT /api/suppliers/:id
 * Updates an existing supplier.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const parsed = await parseIdParam(context.params, "supplier");
    if (!parsed.success) return parsed.response;

    const body = await readJsonBody(request);
    const validation = updateSupplierSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: validationErrorDetails(validation.error),
        },
        { status: 400 }
      );
    }

    const updated = await SupplierService.update(parsed.id, validation.data);
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return toErrorResponse(error, "Failed to update supplier");
  }
}

/**
 * DELETE /api/suppliers/:id
 * Deletes a supplier if no batches are associated with it.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const parsed = await parseIdParam(context.params, "supplier");
    if (!parsed.success) return parsed.response;

    await SupplierService.delete(parsed.id);
    return NextResponse.json(
      { message: "Supplier deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    return toErrorResponse(error, "Failed to delete supplier");
  }
}

/** POST creates resources on the collection route, not on an existing :id. */
export function POST() {
  return methodNotAllowedResponse(["GET", "PUT", "DELETE"]);
}

/** PATCH is not implemented; use PUT for full updates. */
export function PATCH() {
  return methodNotAllowedResponse(["GET", "PUT", "DELETE"]);
}
