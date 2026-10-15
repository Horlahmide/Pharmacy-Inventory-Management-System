import { NextRequest, NextResponse } from "next/server";
import { ProductService } from "@/services/Product.service";
import { updateProductSchema } from "@/lib/validation";
import {
  toErrorResponse,
  parseIdParam,
  readJsonBody,
  validationErrorDetails,
  methodNotAllowedResponse,
} from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/products/:id
 * Retrieves a single product with its category and manufacturer names.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const parsed = await parseIdParam(context.params, "product");
    if (!parsed.success) return parsed.response;

    const product = await ProductService.getById(parsed.id);
    return NextResponse.json(product, { status: 200 });
  } catch (error) {
    return toErrorResponse(error, "Failed to get product");
  }
}

/**
 * PUT /api/products/:id
 * Updates an existing product (partial payload; uniqueness merged with
 * current values server-side).
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const parsed = await parseIdParam(context.params, "product");
    if (!parsed.success) return parsed.response;

    const body = await readJsonBody(request);
    const validation = updateProductSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: validationErrorDetails(validation.error),
        },
        { status: 400 }
      );
    }

    const updated = await ProductService.update(parsed.id, validation.data);
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return toErrorResponse(error, "Failed to update product");
  }
}

/**
 * DELETE /api/products/:id
 * Deletes a product if no batches or sales reference it.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const parsed = await parseIdParam(context.params, "product");
    if (!parsed.success) return parsed.response;

    await ProductService.delete(parsed.id);
    return NextResponse.json(
      { message: "Product deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    return toErrorResponse(error, "Failed to delete product");
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
