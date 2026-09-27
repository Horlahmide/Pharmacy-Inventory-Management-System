import { prisma } from "@/lib/prisma";
import type { CreateCategoryInput, UpdateCategoryInput } from "@/lib/validation";

/**
 * Service class for Category business logic and database interactions.
 */
export class CategoryService {
  /**
   * Retrieves all categories, ordered alphabetically by name.
   * Includes the count of associated products.
   */
  static async getAll() {
    return prisma.category.findMany({
      orderBy: {
        name: "asc",
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
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
      const error = new Error(`Category with ID ${id} not found`);
      (error as any).code = "NOT_FOUND";
      throw error;
    }

    return category;
  }

  /**
   * Creates a new category.
   * Checks for duplicate category names (case-insensitive) before creation.
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
      const error = new Error(`Category with name "${input.name}" already exists`);
      (error as any).code = "CONFLICT";
      throw error;
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
        const error = new Error(`Category with name "${input.name}" already exists`);
        (error as any).code = "CONFLICT";
        throw error;
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
   * Business rule: A category CANNOT be deleted if it has associated products.
   */
  static async delete(id: number) {
    // 1. Verify category exists
    await this.getById(id);

    // 2. Check for associated products
    const productCount = await prisma.product.count({
      where: { categoryId: id },
    });

    if (productCount > 0) {
      const error = new Error(
        `Cannot delete category: it is currently linked to ${productCount} product(s). Reassign or delete the products first.`
      );
      (error as any).code = "BAD_REQUEST";
      throw error;
    }

    return prisma.category.delete({
      where: { id },
    });
  }
}
