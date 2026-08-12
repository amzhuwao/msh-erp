import type { Request, Response, NextFunction } from "express";
import { AppError, handleError } from "../lib/errors.js";

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const { statusCode, body } = handleError(error);
  res.status(statusCode).json(body);
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ code: "SYS-404", message: "Route not found" });
}

export function asyncHandler<T extends Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: T, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

export function validateBody<T>(
  schema: { parse: (data: unknown) => T },
  req: Request,
): T {
  try {
    return schema.parse(req.body);
  } catch (error) {
    throw new AppError(400, "VAL-001", "Invalid request body", error);
  }
}

export function validateQuery<T>(
  schema: { parse: (data: unknown) => T },
  req: Request,
): T {
  try {
    return schema.parse(req.query);
  } catch (error) {
    throw new AppError(400, "VAL-002", "Invalid query parameters", error);
  }
}

export function getClientIp(req: Request): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim();
  }
  return req.socket.remoteAddress;
}
