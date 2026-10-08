import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import type {
  CreateManufacturerInput,
  UpdateManufacturerInput,
  PaginatedQueryInput,
} from "@/lib/validation";

/**
 * Service class for Manufacturer business logic and database interactions.
 * Mirrors CategoryService (same pagination contract, same error semantics).
 */
export class ManufacturerService {
  /**
   * Retrieves a paginated list of manufacturers, ordered alphabetically by name.
   * Includes the count of associated products for each row.
   *
   * Offset pagination (skip/take) keeps the query O(limit) regardless of the
   * total number of manufacturers. The page of rows and the total count are
   * fetched in one batched transaction so they come from the same snapshot.
   */
  static async getAll(query: PaginatedQueryInput) {
    const { page, limit, search } = query;

    const where: Prisma.ManufacturerWhereInput = search
      ? { name: { contains: search, mode: "insensitive" } }
      : {};

    const [data, totalItems] = await prisma.$transaction([
      prisma.manufacturer.findMany({
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
      prisma.manufacturer.count({ where }),
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
   * Retrieves a single manufacturer by its ID.
   */
  static async getById(id: number) {
    const manufacturer = await prisma.manufacturer.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    if (!manufacturer) {
      throw new AppError("NOT_FOUND", `Manufacturer with ID ${id} not found`);
    }

    return manufacturer;
  }

  /**
   * Creates a new manufacturer.
   *
   * Both the duplicate-name and duplicate-email pre-checks are friendly
   * message optimizations. The database's @unique constraints on name and
   * email are the real guarantee under concurrent requests — a race that
   * slips past these checks is caught by Prisma P2002 and mapped to 409
   * by toErrorResponse().
   *
   * Email is stored lowercased so the case-sensitive Postgres unique index
   * behaves as a case-insensitive one ("CEO@PFIZER.com" === "ceo@pfizer.com").
   */
  static async create(input: CreateManufacturerInput) {
    await this.assertNameAvailable(input.name);
    await this.assertEmailAvailable(input.email);

    return prisma.manufacturer.create({
      data: {
        name: input.name,
        phone: input.phone ?? null,
        email: input.email?.toLowerCase() ?? null,
        address: input.address ?? null,
      },
    });
  }

  /**
   * Updates an existing manufacturer.
   */
  static async update(id: number, input: UpdateManufacturerInput) {
    // 1. Verify existence
    await this.getById(id);

    // 2. Uniqueness checks, excluding the row being updated
    if (input.name !== undefined) {
      await this.assertNameAvailable(input.name, id);
    }
    if (input.email !== undefined) {
      await this.assertEmailAvailable(input.email, id);
    }

    return prisma.manufacturer.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email?.toLowerCase() ?? null }),
        ...(input.address !== undefined && { address: input.address }),
      },
    });
  }

  /**
   * Deletes a manufacturer by ID.
   * Business rule: a manufacturer CANNOT be deleted if it has associated products.
   */
  static async delete(id: number) {
    // 1. Verify manufacturer exists
    await this.getById(id);

    // 2. Check for associated products
    const productCount = await prisma.product.count({
      where: { manufacturerId: id },
    });

    if (productCount > 0) {
      throw new AppError(
        "BAD_REQUEST",
        `Cannot delete manufacturer: it is currently linked to ${productCount} product(s). Reassign or delete the products first.`
      );
    }

    return prisma.manufacturer.delete({
      where: { id },
    });
  }

  /**
   * Throws CONFLICT if another manufacturer already uses the given name
   * (case-insensitive). excludeId excludes the row being updated.
   */
  private static async assertNameAvailable(name: string, excludeId?: number) {
    const existing = await prisma.manufacturer.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        ...(excludeId !== undefined && { NOT: { id: excludeId } }),
      },
    });

    if (existing) {
      throw new AppError("CONFLICT", `Manufacturer with name "${name}" already exists`);
    }
  }

  /**
   * Throws CONFLICT if another manufacturer already uses the given email
   * (case-insensitive). Returns early for null/undefined (no email).
   */
  private static async assertEmailAvailable(
    email: string | null | undefined,
    excludeId?: number
  ) {
    if (!email) return;

    const existing = await prisma.manufacturer.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        ...(excludeId !== undefined && { NOT: { id: excludeId } }),
      },
    });

    if (existing) {
      throw new AppError("CONFLICT", `Manufacturer with email "${email}" already exists`);
    }
  }
}