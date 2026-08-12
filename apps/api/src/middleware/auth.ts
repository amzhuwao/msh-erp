import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError, parsePermissions } from "../lib/errors.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "8h";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  isActive: boolean;
  roleId: string;
  roleName: string;
  permissions: Record<string, string[]>;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      roleId: user.roleId,
      roleName: user.roleName,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
  );
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new AppError(401, "AUTH-001", "Authentication required");
    }

    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    if (!user || !user.isActive) {
      throw new AppError(401, "AUTH-002", "Unauthenticated");
    }

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      isActive: user.isActive,
      roleId: user.roleId,
      roleName: user.role.name,
      permissions: parsePermissions(user.role.permissions),
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    next(new AppError(401, "AUTH-001", "Invalid or expired token"));
  }
}

export function authorize(module: string, requiredAction: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        throw new AppError(401, "AUTH-002", "Unauthenticated");
      }

      const override = await prisma.permissionOverride.findUnique({
        where: {
          userId_module_action: {
            userId: user.id,
            module,
            action: requiredAction,
          },
        },
      });

      if (override) {
        if (override.isAllowed) {
          next();
          return;
        }
        throw new AppError(403, "AUTH-003", "Forbidden: Denied by override");
      }

      const modulePermissions = user.permissions[module] ?? [];
      if (modulePermissions.includes(requiredAction)) {
        next();
        return;
      }

      throw new AppError(403, "AUTH-004", "Forbidden: Insufficient privileges");
    } catch (error) {
      next(error);
    }
  };
}

export function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }
  authenticate(req, _res, next);
}
