import { NextRequest, NextResponse } from "next/server";
import { CategoryService } from "@/services/Category.service";
import { updateCategorySchema } from "@/lib/validation";
import { toErrorResponse, parseIdParam, readJsonBody, validationErrorDetails, methodNotAllowedResponse } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/categories/:id
 * Retrieves a single category by ID.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const parsed = await parseIdParam(context.params, "category");
    if (!parsed.success) return parsed.response;

    const category = await CategoryService.getById(parsed.id);
    return NextResponse.json(category, { status: 200 });
  } catch (error) {
    return toErrorResponse(error, "Failed to get category");
  }
}

/**
 * PUT /api/categories/:id
 * Updates an existing category.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const parsed = await parseIdParam(context.params, "category");
    if (!parsed.success) return parsed.response;

    const body = await readJsonBody(request);
    const validation = updateCategorySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: validationErrorDetails(validation.error),
        },
        { status: 400 }
      );
    }

    const updated = await CategoryService.update(parsed.id, validation.data);
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return toErrorResponse(error, "Failed to update category");
  }
}

/**
 * DELETE /api/categories/:id
 * Deletes a category if no products are associated with it.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const parsed = await parseIdParam(context.params, "category");
    if (!parsed.success) return parsed.response;

    await CategoryService.delete(parsed.id);
    return NextResponse.json(
      { message: "Category deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    return toErrorResponse(error, "Failed to delete category");
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