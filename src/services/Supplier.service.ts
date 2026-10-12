import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import type {
  CreateSupplierInput,
  UpdateSupplierInput,
  PaginatedQueryInput,
} from "@/lib/validation";

/**
 * Service class for Supplier business logic and database interactions.
 * Models pharmaceutical vendors/wholesalers from whom batches of stock are received.
 */
export class SupplierService {
  /**
   * Retrieves a paginated list of suppliers, ordered alphabetically by name.
   * Includes the count of associated stock batches for each supplier.
   *
   * Uses offset pagination (skip/take) capped at limit 100.
   * Both data and totalItems are fetched in a single transaction snapshot.
   */
  static async getAll(query: PaginatedQueryInput) {
    const { page, limit, search } = query;

    const where: Prisma.SupplierWhereInput = search
      ? { nameLower: { contains: search.toLowerCase() } }
      : {};

    const [data, totalItems] = await prisma.$transaction([
      prisma.supplier.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: {
            select: { batches: true },
          },
        },
      }),
      prisma.supplier.count({ where }),
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
   * Retrieves a single supplier by ID, including its associated batches count.
   */
  static async getById(id: number) {
    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        _count: {
          select: { batches: true },
        },
      },
    });

    if (!supplier) {
      throw new AppError("NOT_FOUND", `Supplier with ID ${id} not found`);
    }

    return supplier;
  }

  /**
   * Creates a new supplier.
   *
   * Stores nameLower and normalized email at the database level to ensure
   * case-insensitive uniqueness under concurrent requests.
   */
  static async create(input: CreateSupplierInput) {
    await this.assertNameAvailable(input.name);
    await this.assertEmailAvailable(input.email);

    return prisma.supplier.create({
      data: {
        name: input.name,
        nameLower: input.name.toLowerCase(),
        phone: input.phone ?? null,
        email: input.email?.toLowerCase() ?? null,
        address: input.address ?? null,
      },
    });
  }

  /**
   * Updates an existing supplier.
   */
  static async update(id: number, input: UpdateSupplierInput) {
    // 1. Verify existence
    await this.getById(id);

    // 2. Uniqueness checks, excluding the row being updated
    if (input.name !== undefined) {
      await this.assertNameAvailable(input.name, id);
    }
    if (input.email !== undefined) {
      await this.assertEmailAvailable(input.email, id);
    }

    return prisma.supplier.update({
      where: { id },
      data: {
        ...(input.name !== undefined && {
          name: input.name,
          nameLower: input.name.toLowerCase(),
        }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email?.toLowerCase() ?? null }),
        ...(input.address !== undefined && { address: input.address }),
      },
    });
  }

  /**
   * Deletes a supplier by ID.
   * Business rule: A supplier CANNOT be deleted if it has associated batches.
   * Benefiting from @@index([supplierId]) on the Batch table.
   */
  static async delete(id: number) {
    // 1. Verify supplier exists
    await this.getById(id);

    // 2. Check for associated stock batches
    const batchCount = await prisma.batch.count({
      where: { supplierId: id },
    });

    if (batchCount > 0) {
      throw new AppError(
        "BAD_REQUEST",
        `Cannot delete supplier: it is currently linked to ${batchCount} batch(es). Reassign or delete the batches first.`
      );
    }

    return prisma.supplier.delete({
      where: { id },
    });
  }

  /**
   * Throws CONFLICT if another supplier already uses the given name (case-insensitive).
   */
  private static async assertNameAvailable(name: string, excludeId?: number) {
    const existing = await prisma.supplier.findFirst({
      where: {
        nameLower: name.toLowerCase(),
        ...(excludeId !== undefined && { NOT: { id: excludeId } }),
      },
    });

    if (existing) {
      throw new AppError("CONFLICT", `Supplier with name "${name}" already exists`);
    }
  }

  /**
   * Throws CONFLICT if another supplier already uses the given email (case-insensitive).
   */
  private static async assertEmailAvailable(
    email: string | null | undefined,
    excludeId?: number
  ) {
    if (!email) return;

    const existing = await prisma.supplier.findFirst({
      where: {
        email: email.toLowerCase(),
        ...(excludeId !== undefined && { NOT: { id: excludeId } }),
      },
    });

    if (existing) {
      throw new AppError("CONFLICT", `Supplier with email "${email}" already exists`);
    }
  }
}
