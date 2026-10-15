import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import type {
  CreateProductInput,
  UpdateProductInput,
  ProductQueryInput,
} from "@/lib/validation";

/**
 * Service class for Product business logic and database interactions.
 * Products are the first dependent entity: they reference Category and
 * Manufacturer (foreign keys), carry a Decimal money field, an optional
 * unique barcode, and a composite uniqueness rule on
 * (nameLower, strength, manufacturerId).
 */
export class ProductService {
  /**
   * Retrieves a paginated list of products with optional filters
   * (search on name, categoryId, manufacturerId).
   *
   * Includes category/manufacturer names (so the frontend needs no extra
   * API calls) and child counts (batches, sale items).
   */
  static async getAll(query: ProductQueryInput) {
    const { page, limit, search, categoryId, manufacturerId } = query;

    const where: Prisma.ProductWhereInput = {
      ...(search && { nameLower: { contains: search.toLowerCase() } }),
      ...(categoryId !== undefined && { categoryId }),
      ...(manufacturerId !== undefined && { manufacturerId }),
    };

    const [data, totalItems] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          category: { select: { id: true, name: true } },
          manufacturer: { select: { id: true, name: true } },
          _count: { select: { batches: true, saleItems: true } },
        },
      }),
      prisma.product.count({ where }),
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
   * Retrieves a single product by ID with its category and manufacturer names.
   */
  static async getById(id: number) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        manufacturer: { select: { id: true, name: true } },
        _count: { select: { batches: true, saleItems: true } },
      },
    });

    if (!product) {
      throw new AppError("NOT_FOUND", `Product with ID ${id} not found`);
    }

    return product;
  }

  /**
   * Creates a new product.
   *
   * Order of checks:
   * 1. Foreign keys exist (clear 400 instead of a confusing P2003)
   * 2. Composite uniqueness (name + strength + manufacturer)
   * 3. Barcode uniqueness (when provided)
   *
   * nameLower and strength normalization happen here so the composite
   * unique index is race-safe at the database level.
   */
  static async create(input: CreateProductInput) {
    await this.assertCategoryExists(input.categoryId);
    await this.assertManufacturerExists(input.manufacturerId);

    const strength = input.strength ?? "";
    const barcode = input.barcode || null;

    await this.assertProductUnique(input.name, strength, input.manufacturerId);
    await this.assertBarcodeAvailable(barcode);

    return prisma.product.create({
      data: {
        name: input.name,
        nameLower: input.name.toLowerCase(),
        strength,
        description: input.description ?? null,
        sellingPrice: input.sellingPrice,
        barcode,
        categoryId: input.categoryId,
        manufacturerId: input.manufacturerId,
      },
    });
  }

  /**
   * Updates an existing product.
   *
   * Partial payloads require merging with current values before the
   * composite uniqueness check: a client sending only { name } must still
   * be checked against the product's CURRENT strength and manufacturerId.
   */
  static async update(id: number, input: UpdateProductInput) {
    // 1. Verify existence (also provides current values for the merge)
    const current = await this.getById(id);

    // 2. FK checks — only for IDs actually being changed
    if (input.categoryId !== undefined) {
      await this.assertCategoryExists(input.categoryId);
    }
    if (input.manufacturerId !== undefined) {
      await this.assertManufacturerExists(input.manufacturerId);
    }

    // 3. Composite uniqueness on the MERGED record, excluding self
    const mergedName = input.name ?? current.name;
    const mergedStrength =
      input.strength !== undefined ? input.strength ?? "" : current.strength;
    const mergedManufacturerId = input.manufacturerId ?? current.manufacturerId;
    await this.assertProductUnique(
      mergedName,
      mergedStrength,
      mergedManufacturerId,
      id
    );

    // 4. Barcode uniqueness — only when barcode is being changed
    if (input.barcode !== undefined) {
      await this.assertBarcodeAvailable(input.barcode || null, id);
    }

    return prisma.product.update({
      where: { id },
      data: {
        ...(input.name !== undefined && {
          name: input.name,
          nameLower: input.name.toLowerCase(),
        }),
        ...(input.strength !== undefined && { strength: input.strength ?? "" }),
        ...(input.description !== undefined && {
          description: input.description,
        }),
        ...(input.sellingPrice !== undefined && {
          sellingPrice: input.sellingPrice,
        }),
        ...(input.barcode !== undefined && { barcode: input.barcode || null }),
        ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
        ...(input.manufacturerId !== undefined && {
          manufacturerId: input.manufacturerId,
        }),
      },
    });
  }

  /**
   * Deletes a product by ID.
   * Business rule: a product CANNOT be deleted while it has stock batches
   * or sales records referencing it.
   */
  static async delete(id: number) {
    // 1. Verify product exists
    await this.getById(id);

    // 2. Check both child tables
    const batchCount = await prisma.batch.count({
      where: { productId: id },
    });
    if (batchCount > 0) {
      throw new AppError(
        "BAD_REQUEST",
        `Cannot delete product: it is currently linked to ${batchCount} batch(es). Delete the batches first.`
      );
    }

    const saleItemCount = await prisma.saleItem.count({
      where: { productId: id },
    });
    if (saleItemCount > 0) {
      throw new AppError(
        "BAD_REQUEST",
        `Cannot delete product: it is referenced by ${saleItemCount} sale record(s).`
      );
    }

    return prisma.product.delete({
      where: { id },
    });
  }

  /**
   * Throws CONFLICT if the same manufacturer already has a product with
   * this name (case-insensitive) and strength — the composite unique rule.
   */
  private static async assertProductUnique(
    name: string,
    strength: string,
    manufacturerId: number,
    excludeId?: number
  ) {
    const existing = await prisma.product.findFirst({
      where: {
        nameLower: name.toLowerCase(),
        strength,
        manufacturerId,
        ...(excludeId !== undefined && { NOT: { id: excludeId } }),
      },
    });

    if (existing) {
      throw new AppError(
        "CONFLICT",
        `Product "${name}" (${strength || "no strength"}) already exists for this manufacturer`
      );
    }
  }

  /**
   * Throws CONFLICT if another product already uses the given barcode.
   * Null barcodes are skipped (PostgreSQL allows many NULLs under @unique).
   */
  private static async assertBarcodeAvailable(
    barcode: string | null,
    excludeId?: number
  ) {
    if (!barcode) return;

    const existing = await prisma.product.findFirst({
      where: {
        barcode,
        ...(excludeId !== undefined && { NOT: { id: excludeId } }),
      },
    });

    if (existing) {
      throw new AppError(
        "CONFLICT",
        `Product with barcode "${barcode}" already exists`
      );
    }
  }

  /**
   * Throws BAD_REQUEST when the referenced category does not exist.
   * (A concurrent delete can still trip the DB foreign key — P2003 maps
   * to 409 via toErrorResponse as the race-condition safety net.)
   */
  private static async assertCategoryExists(categoryId: number) {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      throw new AppError(
        "BAD_REQUEST",
        `Category with ID ${categoryId} not found`
      );
    }
  }

  /**
   * Throws BAD_REQUEST when the referenced manufacturer does not exist.
   */
  private static async assertManufacturerExists(manufacturerId: number) {
    const manufacturer = await prisma.manufacturer.findUnique({
      where: { id: manufacturerId },
    });
    if (!manufacturer) {
      throw new AppError(
        "BAD_REQUEST",
        `Manufacturer with ID ${manufacturerId} not found`
      );
    }
  }
}
