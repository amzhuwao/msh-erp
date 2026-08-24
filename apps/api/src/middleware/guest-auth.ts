import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";
const GUEST_JWT_EXPIRES_IN = process.env.GUEST_JWT_EXPIRES_IN ?? "30d";

export interface GuestAuth {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

declare global {
  namespace Express {
    interface Request {
      guest?: GuestAuth;
    }
  }
}

export function signGuestToken(guest: GuestAuth): string {
  return jwt.sign(
    { sub: guest.id, typ: "guest", email: guest.email },
    JWT_SECRET,
    { expiresIn: GUEST_JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
  );
}

export async function authenticateGuest(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new AppError(401, "GST-AUTH-001", "Guest authentication required");
    }

    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; typ?: string };
    if (payload.typ !== "guest") {
      throw new AppError(401, "GST-AUTH-002", "Invalid guest session");
    }

    const guest = await prisma.guest.findUnique({ where: { id: payload.sub } });
    if (!guest) {
      throw new AppError(401, "GST-AUTH-002", "Invalid guest session");
    }

    req.guest = {
      id: guest.id,
      email: guest.email,
      firstName: guest.firstName,
      lastName: guest.lastName,
    };
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    next(new AppError(401, "GST-AUTH-001", "Invalid or expired guest session"));
  }
}
