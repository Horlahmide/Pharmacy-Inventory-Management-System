import { NextRequest, NextResponse } from "next/server";
import { CategoryService } from "@/services/Category.service";
import { updateCategorySchema, categoryIdParamSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Helper to validate and parse ID parameter.
 */
async function parseCategoryId(paramsPromise: Promise<{ id: string }>) {
  const params = await paramsPromise;
  const result = categoryIdParamSchema.safeParse(params);
  if (!result.success) {
    return {
      success: false as const,
      response: NextResponse.json(
        {
          error: "Invalid category ID",
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      ),
    };
  }
  return { success: true as const, id: result.data.id };
}

/**
 * GET /api/categories/:id
 * Retrieves a single category by ID.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const parsed = await parseCategoryId(context.params);
    if (!parsed.success) return parsed.response;

    const category = await CategoryService.getById(parsed.id);
    return NextResponse.json(category, { status: 200 });
  } catch (error: any) {
    if (error.code === "NOT_FOUND") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Failed to get category:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/categories/:id
 * Updates an existing category.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const parsed = await parseCategoryId(context.params);
    if (!parsed.success) return parsed.response;

    const body = await request.json();
    const validation = updateCategorySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const updated = await CategoryService.update(parsed.id, validation.data);
    return NextResponse.json(updated, { status: 200 });
  } catch (error: any) {
    if (error.code === "NOT_FOUND") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error.code === "CONFLICT") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Failed to update category:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/categories/:id
 * Deletes a category if no products are associated with it.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const parsed = await parseCategoryId(context.params);
    if (!parsed.success) return parsed.response;

    await CategoryService.delete(parsed.id);
    return NextResponse.json(
      { message: "Category deleted successfully" },
      { status: 200 }
    );
  } catch (error: any) {
    if (error.code === "NOT_FOUND") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error.code === "BAD_REQUEST") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to delete category:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
