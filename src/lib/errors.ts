import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { idParamSchema } from "@/lib/validation";

/**
 * Business error codes used by the service layer.
 * Route handlers translate these into HTTP status codes.
 */
export type AppErrorCode = "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST";

const APP_ERROR_STATUS: Record<AppErrorCode, number> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
  BAD_REQUEST: 400,
};

/**
 * Error thrown by services when a business rule prevents an operation.
 * Keeping the code on the error (instead of a plain Error) lets route
 * handlers respond with the correct status without re-inspecting state.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

/**
 * Maps any thrown error to an HTTP response.
 *
 * Handling order:
 * 1. AppError            -> 404 / 409 / 400 (deterministic business rules)
 * 2. Prisma known errors -> races the service-layer pre-checks cannot see:
 *    P2002 (unique constraint violated concurrently)  -> 409
 *    P2003 (foreign key violated concurrently)       -> 409
 *    P2025 (row deleted between lookup and write)    -> 404
 * 3. SyntaxError from request.json() -> 400 (malformed client payload)
 * 4. Anything else       -> logged server-side, generic 500 (no internals leaked)
 *
 * The fallback message is authored by the route, so it is always a safe,
 * intentionally generic string.
 */
export function toErrorResponse(error: unknown, fallbackMessage: string): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message },
      { status: APP_ERROR_STATUS[error.code] }
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return NextResponse.json(
          { error: "A record with the same unique value already exists" },
          { status: 409 }
        );
      case "P2003":
        return NextResponse.json(
          { error: "Cannot complete the operation: this record is referenced by other data" },
          { status: 409 }
        );
      case "P2025":
        return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  console.error(fallbackMessage, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

/**
 * Validates and parses the :id route parameter shared by every entity's
 * detail route (e.g. /api/manufacturers/:id).
 *
 * Returns either the parsed positive integer ID or a 400 Bad Request
 * response. Keeping this in one place means every entity route validates
 * URL IDs identically without duplicating the ~20-line helper per entity.
 */
export async function parseIdParam(
  paramsPromise: Promise<{ id: string }>,
  label: string
): Promise<
  { success: true; id: number } | { success: false; response: NextResponse }
> {
  const params = await paramsPromise;
  const result = idParamSchema(label).safeParse(params);
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: `Invalid ${label} ID`,
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      ),
    };
  }
  return { success: true, id: result.data.id };
}
