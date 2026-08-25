import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { VipStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError, type PermissionsMap, parsePermissions } from "../lib/errors.js";
import { writeAuditLog } from "./system.service.js";

export const ACCESS_MODULES = [
  "Auth", "Reservations", "GroupReservations", "Housekeeping", "POS", "Finance", "Admin",
  "Conference", "Inventory", "Procurement", "Maintenance", "CRM", "Corporate",
  "Revenue", "GuestServices", "Reporting", "Notifications", "Integrations",
] as const;

export const ACCESS_ACTIONS = [
  "VIEW", "CREATE", "EDIT", "DELETE", "CANCEL", "OVERRIDE", "EXPORT", "APPROVE", "VIEW_LIMITED",
] as const;

const ADMIN_ROLE_NAME = "System Administrator";
const BCRYPT_ROUNDS = 12;

type Actor = {
  id: string;
  roleName: string;
  permissions: PermissionsMap;
};

function sanitizeUser<T extends { passwordHash?: string }>(user: T) {
  const { passwordHash: _omit, ...rest } = user;
  return rest;
}

async function audit(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  details?: Prisma.InputJsonValue,
) {
  await writeAuditLog({ userId, module: "Admin", action, entityType, entityId, details });
}

function assertPassword(password: string) {
  if (password.length < 8) {
    throw new AppError(400, "ACC-001", "Password must be at least 8 characters");
  }
}

function normalizePermissions(raw: unknown): PermissionsMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AppError(400, "ACC-010", "Permissions must be an object of module → actions[]");
  }
  const out: PermissionsMap = {};
  for (const [module, actions] of Object.entries(raw as Record<string, unknown>)) {
    if (!ACCESS_MODULES.includes(module as (typeof ACCESS_MODULES)[number])) {
      throw new AppError(400, "ACC-011", `Unknown module: ${module}`);
    }
    if (!Array.isArray(actions) || actions.some((a) => typeof a !== "string")) {
      throw new AppError(400, "ACC-012", `Invalid actions for module ${module}`);
    }
    const unique = [...new Set(actions as string[])];
    for (const action of unique) {
      if (!ACCESS_ACTIONS.includes(action as (typeof ACCESS_ACTIONS)[number])) {
        throw new AppError(400, "ACC-013", `Unknown action: ${action}`);
      }
    }
    if (unique.length) out[module] = unique;
  }
  return out;
}

function isSystemAdmin(actor: Actor) {
  return actor.roleName === ADMIN_ROLE_NAME;
}

/** Actor may only assign roles whose permissions are covered by their own (least privilege). */
function assertCanAssignRole(actor: Actor, roleName: string, rolePermissions: PermissionsMap) {
  if (roleName === ADMIN_ROLE_NAME && !isSystemAdmin(actor)) {
    throw new AppError(403, "ACC-020", "Only a System Administrator can assign the System Administrator role");
  }
  if (isSystemAdmin(actor)) return;

  for (const [module, actions] of Object.entries(rolePermissions)) {
    const allowed = actor.permissions[module] ?? [];
    for (const action of actions) {
      if (!allowed.includes(action)) {
        throw new AppError(
          403,
          "ACC-021",
          `Cannot assign role with ${module}:${action} — you do not hold that right`,
        );
      }
    }
  }
}

async function countActiveAdmins(excludeUserId?: string) {
  return prisma.user.count({
    where: {
      isActive: true,
      role: { name: ADMIN_ROLE_NAME },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
}

async function getRoleOrThrow(roleId: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new AppError(404, "ACC-030", "Role not found");
  return role;
}

// ─── Meta ───────────────────────────────────────────────────────────────────

export function listAccessCatalog() {
  return { modules: ACCESS_MODULES, actions: ACCESS_ACTIONS };
}

export async function listDepartments() {
  return prisma.department.findMany({ orderBy: { name: "asc" } });
}

// ─── Roles ──────────────────────────────────────────────────────────────────

export async function listRoles() {
  return prisma.role.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getRole(id: string) {
  const role = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!role) throw new AppError(404, "ACC-030", "Role not found");
  return role;
}

export async function createRole(input: {
  name: string;
  description?: string;
  permissions: unknown;
  actor: Actor;
}) {
  if (!isSystemAdmin(input.actor) && !(input.actor.permissions.Admin ?? []).includes("CREATE")) {
    throw new AppError(403, "ACC-004", "Forbidden: Insufficient privileges");
  }
  const permissions = normalizePermissions(input.permissions);
  assertCanAssignRole(input.actor, input.name.trim(), permissions);

  const role = await prisma.role.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      permissions,
    },
  });
  await audit(input.actor.id, "ROLE_CREATE", "Role", role.id, { name: role.name });
  return role;
}

export async function updateRole(id: string, input: {
  name?: string;
  description?: string | null;
  permissions?: unknown;
  actor: Actor;
}) {
  const current = await getRoleOrThrow(id);
  if (current.name === ADMIN_ROLE_NAME && !isSystemAdmin(input.actor)) {
    throw new AppError(403, "ACC-022", "Only a System Administrator can edit the System Administrator role");
  }

  const nextName = input.name?.trim() ?? current.name;
  const nextPermissions = input.permissions !== undefined
    ? normalizePermissions(input.permissions)
    : parsePermissions(current.permissions);

  if (current.name === ADMIN_ROLE_NAME && nextName !== ADMIN_ROLE_NAME) {
    throw new AppError(400, "ACC-023", "Cannot rename the System Administrator role");
  }

  assertCanAssignRole(input.actor, nextName, nextPermissions);

  const role = await prisma.role.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      description: input.description === undefined ? undefined : (input.description?.trim() || null),
      permissions: input.permissions !== undefined ? nextPermissions : undefined,
    },
  });
  await audit(input.actor.id, "ROLE_UPDATE", "Role", id, { name: role.name });
  return role;
}

export async function deleteRole(id: string, actor: Actor) {
  const role = await getRoleOrThrow(id);
  if (role.name === ADMIN_ROLE_NAME) {
    throw new AppError(400, "ACC-024", "Cannot delete the System Administrator role");
  }
  const users = await prisma.user.count({ where: { roleId: id } });
  if (users > 0) {
    throw new AppError(409, "ACC-025", "Role still has users assigned — reassign them first");
  }
  await prisma.role.delete({ where: { id } });
  await audit(actor.id, "ROLE_DELETE", "Role", id, { name: role.name });
  return { ok: true };
}

// ─── Staff users ────────────────────────────────────────────────────────────

const userInclude = {
  role: { select: { id: true, name: true, permissions: true } },
  department: { select: { id: true, name: true } },
  permissionOverrides: true,
} as const;

export async function listUsers(search?: string) {
  const where = search
    ? {
        OR: [
          { username: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { fullName: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const users = await prisma.user.findMany({
    where,
    include: userInclude,
    orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
  });
  return users.map(sanitizeUser);
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, include: userInclude });
  if (!user) throw new AppError(404, "ACC-040", "User not found");
  return sanitizeUser(user);
}

export async function createUser(input: {
  username: string;
  email: string;
  password: string;
  fullName: string;
  roleId: string;
  departmentId?: string | null;
  isActive?: boolean;
  sessionTimeoutMinutes?: number;
  actor: Actor;
}) {
  assertPassword(input.password);
  const role = await getRoleOrThrow(input.roleId);
  assertCanAssignRole(input.actor, role.name, parsePermissions(role.permissions));

  const username = input.username.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();

  const clash = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
  });
  if (clash) throw new AppError(409, "ACC-041", "Username or email already exists");

  if (input.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
    if (!dept) throw new AppError(404, "ACC-042", "Department not found");
  }

  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      fullName: input.fullName.trim(),
      roleId: input.roleId,
      departmentId: input.departmentId || null,
      isActive: input.isActive ?? true,
      sessionTimeoutMinutes: input.sessionTimeoutMinutes ?? 20,
    },
    include: userInclude,
  });
  await audit(input.actor.id, "USER_CREATE", "User", user.id, { username, roleId: input.roleId });
  return sanitizeUser(user);
}

export async function updateUser(id: string, input: {
  email?: string;
  fullName?: string;
  roleId?: string;
  departmentId?: string | null;
  isActive?: boolean;
  sessionTimeoutMinutes?: number;
  actor: Actor;
}) {
  const current = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });
  if (!current) throw new AppError(404, "ACC-040", "User not found");

  if (id === input.actor.id) {
    if (input.isActive === false) {
      throw new AppError(400, "ACC-043", "You cannot deactivate your own account");
    }
    if (input.roleId && input.roleId !== current.roleId) {
      throw new AppError(400, "ACC-044", "You cannot change your own role");
    }
  }

  let nextRole = current.role;
  if (input.roleId && input.roleId !== current.roleId) {
    nextRole = await getRoleOrThrow(input.roleId);
    assertCanAssignRole(input.actor, nextRole.name, parsePermissions(nextRole.permissions));
  }

  if (
    current.isActive
    && current.role.name === ADMIN_ROLE_NAME
    && (input.isActive === false || (nextRole.name !== ADMIN_ROLE_NAME && input.roleId))
  ) {
    const remaining = await countActiveAdmins(id);
    if (remaining < 1) {
      throw new AppError(400, "ACC-045", "Cannot remove the last active System Administrator");
    }
  }

  if (input.email) {
    const email = input.email.trim().toLowerCase();
    const clash = await prisma.user.findFirst({ where: { email, id: { not: id } } });
    if (clash) throw new AppError(409, "ACC-041", "Email already exists");
  }

  if (input.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
    if (!dept) throw new AppError(404, "ACC-042", "Department not found");
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      email: input.email?.trim().toLowerCase(),
      fullName: input.fullName?.trim(),
      roleId: input.roleId,
      departmentId: input.departmentId === undefined ? undefined : (input.departmentId || null),
      isActive: input.isActive,
      sessionTimeoutMinutes: input.sessionTimeoutMinutes,
    },
    include: userInclude,
  });
  await audit(input.actor.id, "USER_UPDATE", "User", id, {
    roleId: input.roleId,
    isActive: input.isActive,
  });
  return sanitizeUser(user);
}

export async function deactivateUser(id: string, actor: Actor) {
  return updateUser(id, { isActive: false, actor });
}

export async function resetUserPassword(id: string, password: string, actor: Actor) {
  assertPassword(password);
  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) throw new AppError(404, "ACC-040", "User not found");

  await prisma.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) },
  });
  await audit(actor.id, "USER_PASSWORD_RESET", "User", id);
  return { ok: true };
}

export async function setUserOverrides(id: string, input: {
  overrides: { module: string; action: string; isAllowed: boolean }[];
  actor: Actor;
}) {
  const current = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!current) throw new AppError(404, "ACC-040", "User not found");

  if (id === input.actor.id) {
    throw new AppError(400, "ACC-046", "You cannot change your own permission overrides");
  }

  for (const o of input.overrides) {
    if (!ACCESS_MODULES.includes(o.module as (typeof ACCESS_MODULES)[number])) {
      throw new AppError(400, "ACC-011", `Unknown module: ${o.module}`);
    }
    if (!ACCESS_ACTIONS.includes(o.action as (typeof ACCESS_ACTIONS)[number])) {
      throw new AppError(400, "ACC-013", `Unknown action: ${o.action}`);
    }
    // Grants must not exceed what the actor holds (deny overrides are always fine)
    if (o.isAllowed && !isSystemAdmin(input.actor)) {
      const allowed = input.actor.permissions[o.module] ?? [];
      if (!allowed.includes(o.action)) {
        throw new AppError(
          403,
          "ACC-021",
          `Cannot grant ${o.module}:${o.action} — you do not hold that right`,
        );
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.permissionOverride.deleteMany({ where: { userId: id } });
    if (input.overrides.length) {
      await tx.permissionOverride.createMany({
        data: input.overrides.map((o) => ({
          userId: id,
          module: o.module,
          action: o.action,
          isAllowed: o.isAllowed,
        })),
      });
    }
  });

  await audit(input.actor.id, "USER_OVERRIDES_SET", "User", id, {
    count: input.overrides.length,
  });
  return getUser(id);
}

// ─── Guest portal accounts ──────────────────────────────────────────────────

function guestAccountView<T extends { passwordHash: string | null }>(guest: T) {
  const { passwordHash, ...rest } = guest;
  return {
    ...rest,
    hasPortalAccount: Boolean(passwordHash),
  };
}

export async function listGuestAccounts(search?: string) {
  const where = search
    ? {
        OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const guests = await prisma.guest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      _count: { select: { reservations: true } },
    },
  });
  return guests.map(guestAccountView);
}

export async function getGuestAccount(id: string) {
  const guest = await prisma.guest.findUnique({
    where: { id },
    include: {
      _count: { select: { reservations: true, folios: true } },
      reservations: {
        orderBy: { checkInDate: "desc" },
        take: 5,
        select: {
          id: true,
          reservationNumber: true,
          status: true,
          checkInDate: true,
          checkOutDate: true,
        },
      },
    },
  });
  if (!guest) throw new AppError(404, "ACC-050", "Guest account not found");
  return guestAccountView(guest);
}

export async function createGuestAccount(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  nationality?: string;
  nationalId?: string;
  passportNumber?: string;
  vipStatus?: VipStatus;
  notes?: string;
  password?: string;
  actor: Actor;
}) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.guest.findUnique({ where: { email } });
  if (existing) throw new AppError(409, "ACC-051", "A guest with this email already exists");

  let passwordHash: string | undefined;
  if (input.password) {
    assertPassword(input.password);
    passwordHash = await bcrypt.hash(input.password, 10);
  }

  const guest = await prisma.guest.create({
    data: {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email,
      phone: input.phone?.trim() || null,
      nationality: input.nationality?.trim() || null,
      nationalId: input.nationalId?.trim() || null,
      passportNumber: input.passportNumber?.trim() || null,
      vipStatus: input.vipStatus ?? VipStatus.NONE,
      notes: input.notes?.trim() || null,
      passwordHash,
    },
    include: { _count: { select: { reservations: true } } },
  });
  await audit(input.actor.id, "GUEST_ACCOUNT_CREATE", "Guest", guest.id, {
    email,
    hasPortalAccount: Boolean(passwordHash),
  });
  return guestAccountView(guest);
}

export async function updateGuestAccount(id: string, input: {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  nationality?: string | null;
  nationalId?: string | null;
  passportNumber?: string | null;
  vipStatus?: VipStatus;
  notes?: string | null;
  actor: Actor;
}) {
  const current = await prisma.guest.findUnique({ where: { id } });
  if (!current) throw new AppError(404, "ACC-050", "Guest account not found");

  if (input.email) {
    const email = input.email.trim().toLowerCase();
    const clash = await prisma.guest.findFirst({ where: { email, id: { not: id } } });
    if (clash) throw new AppError(409, "ACC-051", "Email already exists");
  }

  const guest = await prisma.guest.update({
    where: { id },
    data: {
      firstName: input.firstName?.trim(),
      lastName: input.lastName?.trim(),
      email: input.email?.trim().toLowerCase(),
      phone: input.phone === undefined ? undefined : (input.phone?.trim() || null),
      nationality: input.nationality === undefined ? undefined : (input.nationality?.trim() || null),
      nationalId: input.nationalId === undefined ? undefined : (input.nationalId?.trim() || null),
      passportNumber: input.passportNumber === undefined ? undefined : (input.passportNumber?.trim() || null),
      vipStatus: input.vipStatus,
      notes: input.notes === undefined ? undefined : (input.notes?.trim() || null),
    },
    include: { _count: { select: { reservations: true } } },
  });
  await audit(input.actor.id, "GUEST_ACCOUNT_UPDATE", "Guest", id);
  return guestAccountView(guest);
}

export async function setGuestPortalPassword(id: string, password: string, actor: Actor) {
  assertPassword(password);
  const current = await prisma.guest.findUnique({ where: { id } });
  if (!current) throw new AppError(404, "ACC-050", "Guest account not found");

  const guest = await prisma.guest.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(password, 10) },
    include: { _count: { select: { reservations: true } } },
  });
  await audit(actor.id, "GUEST_PORTAL_PASSWORD_SET", "Guest", id);
  return guestAccountView(guest);
}

export async function disableGuestPortal(id: string, actor: Actor) {
  const current = await prisma.guest.findUnique({ where: { id } });
  if (!current) throw new AppError(404, "ACC-050", "Guest account not found");

  const guest = await prisma.guest.update({
    where: { id },
    data: { passwordHash: null },
    include: { _count: { select: { reservations: true } } },
  });
  await audit(actor.id, "GUEST_PORTAL_DISABLE", "Guest", id);
  return guestAccountView(guest);
}

export async function deleteGuestAccount(id: string, actor: Actor) {
  const current = await prisma.guest.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          reservations: true,
          folios: true,
          feedback: true,
          loyaltyAccounts: true,
        },
      },
    },
  });
  if (!current) throw new AppError(404, "ACC-050", "Guest account not found");

  const linked =
    current._count.reservations
    + current._count.folios
    + current._count.feedback
    + current._count.loyaltyAccounts;

  if (linked > 0) {
    await prisma.guest.update({ where: { id }, data: { passwordHash: null } });
    await audit(actor.id, "GUEST_ACCOUNT_SOFT_DELETE", "Guest", id, { linked });
    return {
      ok: false,
      deleted: false,
      portalDisabled: true,
      message: "Guest has booking/folio history — portal access was disabled instead of deleting the profile",
    };
  }

  await prisma.guest.delete({ where: { id } });
  await audit(actor.id, "GUEST_ACCOUNT_DELETE", "Guest", id, { email: current.email });
  return { ok: true, deleted: true, portalDisabled: false };
}
