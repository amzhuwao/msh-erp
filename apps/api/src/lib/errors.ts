import { Prisma } from "@prisma/client";

export type PermissionsMap = Record<string, string[]>;

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function handleError(error: unknown) {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: { code: error.code, message: error.message, details: error.details },
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return {
        statusCode: 409,
        body: { code: "DB-001", message: "A record with this value already exists" },
      };
    }
  }

  console.error(error);
  return {
    statusCode: 500,
    body: { code: "SYS-001", message: "Internal server error" },
  };
}

export function parsePermissions(value: Prisma.JsonValue): PermissionsMap {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as PermissionsMap;
  }
  return {};
}
