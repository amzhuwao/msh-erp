import { Router, type Request } from "express";
import { z } from "zod";
import { VipStatus } from "@prisma/client";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler, validateBody, validateQuery } from "../middleware/http.js";
import { paramId } from "../lib/params.js";
import {
  createGuestAccount,
  createRole,
  createUser,
  deactivateUser,
  deleteGuestAccount,
  deleteRole,
  disableGuestPortal,
  getGuestAccount,
  getRole,
  getUser,
  listAccessCatalog,
  listDepartments,
  listGuestAccounts,
  listRoles,
  listUsers,
  resetUserPassword,
  setGuestPortalPassword,
  setUserOverrides,
  updateGuestAccount,
  updateRole,
  updateUser,
} from "../services/accounts.service.js";

export const accountsRouter = Router();
accountsRouter.use(authenticate);

function actorOf(req: Request) {
  return {
    id: req.user!.id,
    roleName: req.user!.roleName,
    permissions: req.user!.permissions,
  };
}

const overrideSchema = z.object({
  module: z.string().min(1),
  action: z.string().min(1),
  isAllowed: z.boolean(),
});

// ─── Catalog / departments ──────────────────────────────────────────────────

accountsRouter.get("/access-catalog", authorize("Admin", "VIEW"), asyncHandler(async (_req, res) => {
  res.json(listAccessCatalog());
}));

accountsRouter.get("/departments", authorize("Admin", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listDepartments() });
}));

// ─── Roles ──────────────────────────────────────────────────────────────────

accountsRouter.get("/roles", authorize("Admin", "VIEW"), asyncHandler(async (_req, res) => {
  res.json({ items: await listRoles() });
}));

accountsRouter.get("/roles/:id", authorize("Admin", "VIEW"), asyncHandler(async (req, res) => {
  res.json(await getRole(paramId(req.params.id)));
}));

accountsRouter.post("/roles", authorize("Admin", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    permissions: z.record(z.string(), z.array(z.string())),
  }), req);
  res.status(201).json(await createRole({ ...body, actor: actorOf(req) }));
}));

accountsRouter.put("/roles/:id", authorize("Admin", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    permissions: z.record(z.string(), z.array(z.string())).optional(),
  }), req);
  res.json(await updateRole(paramId(req.params.id), { ...body, actor: actorOf(req) }));
}));

accountsRouter.delete("/roles/:id", authorize("Admin", "DELETE"), asyncHandler(async (req, res) => {
  res.json(await deleteRole(paramId(req.params.id), actorOf(req)));
}));

// ─── Staff users ────────────────────────────────────────────────────────────

accountsRouter.get("/users", authorize("Admin", "VIEW"), asyncHandler(async (req, res) => {
  const q = validateQuery(z.object({ search: z.string().optional() }), req);
  res.json({ items: await listUsers(q.search) });
}));

accountsRouter.get("/users/:id", authorize("Admin", "VIEW"), asyncHandler(async (req, res) => {
  res.json(await getUser(paramId(req.params.id)));
}));

accountsRouter.post("/users", authorize("Admin", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    username: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    fullName: z.string().min(1),
    roleId: z.string().min(1),
    departmentId: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
    sessionTimeoutMinutes: z.coerce.number().int().min(5).max(480).optional(),
  }), req);
  res.status(201).json(await createUser({ ...body, actor: actorOf(req) }));
}));

accountsRouter.put("/users/:id", authorize("Admin", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    email: z.string().email().optional(),
    fullName: z.string().min(1).optional(),
    roleId: z.string().min(1).optional(),
    departmentId: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
    sessionTimeoutMinutes: z.coerce.number().int().min(5).max(480).optional(),
  }), req);
  res.json(await updateUser(paramId(req.params.id), { ...body, actor: actorOf(req) }));
}));

accountsRouter.delete("/users/:id", authorize("Admin", "DELETE"), asyncHandler(async (req, res) => {
  res.json(await deactivateUser(paramId(req.params.id), actorOf(req)));
}));

accountsRouter.post("/users/:id/password", authorize("Admin", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ password: z.string().min(8) }), req);
  res.json(await resetUserPassword(paramId(req.params.id), body.password, actorOf(req)));
}));

accountsRouter.put("/users/:id/overrides", authorize("Admin", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ overrides: z.array(overrideSchema) }), req);
  res.json(await setUserOverrides(paramId(req.params.id), { ...body, actor: actorOf(req) }));
}));

// ─── Guest accounts ─────────────────────────────────────────────────────────

accountsRouter.get("/guests", authorize("Admin", "VIEW"), asyncHandler(async (req, res) => {
  const q = validateQuery(z.object({ search: z.string().optional() }), req);
  res.json({ items: await listGuestAccounts(q.search) });
}));

accountsRouter.get("/guests/:id", authorize("Admin", "VIEW"), asyncHandler(async (req, res) => {
  res.json(await getGuestAccount(paramId(req.params.id)));
}));

accountsRouter.post("/guests", authorize("Admin", "CREATE"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    nationality: z.string().optional(),
    nationalId: z.string().optional(),
    passportNumber: z.string().optional(),
    vipStatus: z.nativeEnum(VipStatus).optional(),
    notes: z.string().optional(),
    password: z.string().min(8).optional(),
  }), req);
  res.status(201).json(await createGuestAccount({ ...body, actor: actorOf(req) }));
}));

accountsRouter.put("/guests/:id", authorize("Admin", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().nullable().optional(),
    nationality: z.string().nullable().optional(),
    nationalId: z.string().nullable().optional(),
    passportNumber: z.string().nullable().optional(),
    vipStatus: z.nativeEnum(VipStatus).optional(),
    notes: z.string().nullable().optional(),
  }), req);
  res.json(await updateGuestAccount(paramId(req.params.id), { ...body, actor: actorOf(req) }));
}));

accountsRouter.delete("/guests/:id", authorize("Admin", "DELETE"), asyncHandler(async (req, res) => {
  res.json(await deleteGuestAccount(paramId(req.params.id), actorOf(req)));
}));

accountsRouter.post("/guests/:id/portal-password", authorize("Admin", "EDIT"), asyncHandler(async (req, res) => {
  const body = validateBody(z.object({ password: z.string().min(8) }), req);
  res.json(await setGuestPortalPassword(paramId(req.params.id), body.password, actorOf(req)));
}));

accountsRouter.delete("/guests/:id/portal-access", authorize("Admin", "EDIT"), asyncHandler(async (req, res) => {
  res.json(await disableGuestPortal(paramId(req.params.id), actorOf(req)));
}));
