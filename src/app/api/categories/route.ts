import { NextRequest, NextResponse } from "next/server";
import { CategoryService } from "@/services/Category.service";
import { createCategorySchema } from "@/lib/validation";

/**
 * GET /api/categories
 * Retrieves a list of all product categories.
 */
export async function GET() {
  try {
    const categories = await CategoryService.getAll();
    return NextResponse.json(categories, { status: 200 });
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/categories
 * Creates a new category after validating the request body with Zod.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 1. Zod validation
    const validation = createCategorySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    // 2. Business logic & database creation via CategoryService
    const category = await CategoryService.create(validation.data);

    return NextResponse.json(category, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create category:", error);

    if (error.code === "CONFLICT") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
