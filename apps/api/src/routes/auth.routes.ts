import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { signToken, authenticate } from "../middleware/auth.js";
import { asyncHandler, getClientIp, validateBody } from "../middleware/http.js";
import { writeAuditLog } from "../services/system.service.js";

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = validateBody(loginSchema, req);
    const user = await prisma.user.findUnique({
      where: { username: body.username },
      include: { role: true },
    });

    if (!user || !user.isActive) {
      throw new AppError(401, "AUTH-005", "Invalid username or password");
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, "AUTH-005", "Invalid username or password");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const authUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      isActive: user.isActive,
      roleId: user.roleId,
      roleName: user.role.name,
      permissions: user.role.permissions as Record<string, string[]>,
    };

    const token = signToken(authUser);

    await writeAuditLog({
      userId: user.id,
      module: "Auth",
      action: "USER_LOGIN",
      ipAddress: getClientIp(req),
    });

    res.json({
      token,
      user: authUser,
    });
  }),
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw new AppError(401, "AUTH-002", "Unauthenticated");
    }
    res.json({ user: req.user });
  }),
);
