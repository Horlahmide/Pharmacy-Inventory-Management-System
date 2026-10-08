import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  PaginatedQueryInput,
} from "@/lib/validation";

/**
 * Service class for Category business logic and database interactions.
 */
export class CategoryService {
  /**
   * Retrieves a paginated list of categories, ordered alphabetically by name.
   * Includes the count of associated products for each row.
   *
   * Uses offset pagination (skip/take) so the database only ever returns
   * `limit` rows (max 100) regardless of how many categories exist —
   * keeping the query O(limit) instead of O(total rows).
   *
   * The page of rows and the total count are fetched in one batched
   * transaction so both come from the same database snapshot. Without that,
   * a category inserted between the two queries would produce a totalItems
   * that disagrees with the returned page.
   */
  static async getAll(query: PaginatedQueryInput) {
    const { page, limit, search } = query;

    // Typed explicitly: without it TypeScript widens `mode` to string
    // and the query no longer type-checks against Prisma.CategoryWhereInput.
    const where: Prisma.CategoryWhereInput = search
      ? { name: { contains: search, mode: "insensitive" } }
      : {};

    const [data, totalItems] = await prisma.$transaction([
      prisma.category.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: {
            select: { products: true },
          },
        },
      }),
      prisma.category.count({ where }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Retrieves a single category by its ID.
   * Throws an error if the category does not exist.
   */
  static async getById(id: number) {
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category) {
      throw new AppError("NOT_FOUND", `Category with ID ${id} not found`);
    }

    return category;
  }

  /**
   * Creates a new category.
   * Checks for duplicate category names (case-insensitive) before creation.
   *
   * This pre-check is only a friendly-message optimization: it loses the
   * race if two identical names arrive concurrently. The database's unique
   * constraint on `name` is the real guarantee — if it rejects the insert
   * (Prisma P2002), toErrorResponse() maps that to 409.
   */
  static async create(input: CreateCategoryInput) {
    const existing = await prisma.category.findFirst({
      where: {
        name: {
          equals: input.name,
          mode: "insensitive",
        },
      },
    });

    if (existing) {
      throw new AppError(
        "CONFLICT",
        `Category with name "${input.name}" already exists`
      );
    }

    return prisma.category.create({
      data: {
        name: input.name,
        description: input.description ?? null,
      },
    });
  }

  /**
   * Updates an existing category.
   * Validates existence and prevents duplicate names.
   */
  static async update(id: number, input: UpdateCategoryInput) {
    // 1. Verify existence
    await this.getById(id);

    // 2. If name is being changed, check if new name is already taken by another category
    if (input.name) {
      const duplicate = await prisma.category.findFirst({
        where: {
          name: {
            equals: input.name,
            mode: "insensitive",
          },
          NOT: {
            id,
          },
        },
      });

      if (duplicate) {
        throw new AppError(
          "CONFLICT",
          `Category with name "${input.name}" already exists`
        );
      }
    }

    return prisma.category.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
      },
    });
  }

  /**
   * Deletes a category by ID.
   * Business rule: a category CANNOT be deleted if it has associated products.
   *
   * The count check is best-effort: if a product is created concurrently,
   * PostgreSQL's RESTRICT foreign key rejects the delete and toErrorResponse()
   * maps that Prisma error (P2003) to 409 instead of leaking a 500.
   */
  static async delete(id: number) {
    // 1. Verify category exists
    await this.getById(id);

    // 2. Check for associated products
    const productCount = await prisma.product.count({
      where: { categoryId: id },
    });

    if (productCount > 0) {
      throw new AppError(
        "BAD_REQUEST",
        `Cannot delete category: it is currently linked to ${productCount} product(s). Reassign or delete the products first.`
      );
    }

    return prisma.category.delete({
      where: { id },
    });
  }
}
