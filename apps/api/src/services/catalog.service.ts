import { ConferenceResourceCategory, RoomStatus, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { writeAuditLog } from "./system.service.js";

async function audit(userId: string, module: string, action: string, entityType: string, entityId: string, details?: Prisma.InputJsonValue) {
  await writeAuditLog({ userId, module, action, entityType, entityId, details });
}

// ─── Room types & rates ─────────────────────────────────────────────────────

export async function listRoomTypesAdmin(includeInactive = true) {
  return prisma.roomType.findMany({
    where: includeInactive ? undefined : undefined,
    include: {
      ratePlans: { orderBy: { code: "asc" } },
      _count: { select: { rooms: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function createRoomType(input: {
  code: string;
  name: string;
  description?: string;
  maxAdults: number;
  maxChildren: number;
  baseRate: number;
  userId: string;
}) {
  const code = input.code.trim().toUpperCase();
  const existing = await prisma.roomType.findUnique({ where: { code } });
  if (existing) throw new AppError(409, "CAT-001", "Room type code already exists");

  const roomType = await prisma.$transaction(async (tx) => {
    const created = await tx.roomType.create({
      data: {
        code,
        name: input.name.trim(),
        description: input.description?.trim() || `${input.name.trim()} at Manica Skyview Hotel`,
        maxAdults: input.maxAdults,
        maxChildren: input.maxChildren,
        baseRate: input.baseRate,
      },
    });
    await tx.ratePlan.create({
      data: {
        code: `${code}-BAR`,
        name: `${created.name} Best Available Rate`,
        roomTypeId: created.id,
        baseRate: input.baseRate,
      },
    });
    return tx.roomType.findUniqueOrThrow({
      where: { id: created.id },
      include: { ratePlans: true, _count: { select: { rooms: true } } },
    });
  });

  await audit(input.userId, "Reservations", "ROOM_TYPE_CREATE", "RoomType", roomType.id, { code });
  return roomType;
}

export async function updateRoomType(id: string, input: {
  name?: string;
  description?: string;
  maxAdults?: number;
  maxChildren?: number;
  baseRate?: number;
  userId: string;
}) {
  const current = await prisma.roomType.findUnique({ where: { id }, include: { ratePlans: true } });
  if (!current) throw new AppError(404, "CAT-002", "Room type not found");

  const roomType = await prisma.$transaction(async (tx) => {
    const updated = await tx.roomType.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        description: input.description?.trim(),
        maxAdults: input.maxAdults,
        maxChildren: input.maxChildren,
        baseRate: input.baseRate,
      },
    });
    if (input.baseRate !== undefined) {
      const bar = current.ratePlans.find((r) => r.code.endsWith("-BAR")) ?? current.ratePlans[0];
      if (bar) {
        await tx.ratePlan.update({ where: { id: bar.id }, data: { baseRate: input.baseRate, isActive: true } });
      } else {
        await tx.ratePlan.create({
          data: {
            code: `${current.code}-BAR`,
            name: `${updated.name} Best Available Rate`,
            roomTypeId: id,
            baseRate: input.baseRate,
          },
        });
      }
    }
    return tx.roomType.findUniqueOrThrow({
      where: { id },
      include: { ratePlans: true, _count: { select: { rooms: true } } },
    });
  });

  await audit(input.userId, "Reservations", "ROOM_TYPE_UPDATE", "RoomType", id, input);
  return roomType;
}

export async function upsertRatePlan(input: {
  id?: string;
  code: string;
  name: string;
  roomTypeId: string;
  baseRate: number;
  isActive?: boolean;
  userId: string;
}) {
  const roomType = await prisma.roomType.findUnique({ where: { id: input.roomTypeId } });
  if (!roomType) throw new AppError(404, "CAT-002", "Room type not found");

  const code = input.code.trim().toUpperCase();
  let plan;
  if (input.id) {
    plan = await prisma.ratePlan.update({
      where: { id: input.id },
      data: {
        code,
        name: input.name.trim(),
        roomTypeId: input.roomTypeId,
        baseRate: input.baseRate,
        isActive: input.isActive ?? true,
      },
    });
    await audit(input.userId, "Revenue", "RATE_PLAN_UPDATE", "RatePlan", plan.id);
  } else {
    const existing = await prisma.ratePlan.findUnique({ where: { code } });
    if (existing) throw new AppError(409, "CAT-003", "Rate plan code already exists");
    plan = await prisma.ratePlan.create({
      data: {
        code,
        name: input.name.trim(),
        roomTypeId: input.roomTypeId,
        baseRate: input.baseRate,
        isActive: input.isActive ?? true,
      },
    });
    await audit(input.userId, "Revenue", "RATE_PLAN_CREATE", "RatePlan", plan.id);
  }
  return plan;
}

export async function listRoomsAdmin() {
  return prisma.room.findMany({
    include: { roomType: true },
    orderBy: [{ floor: "asc" }, { number: "asc" }],
  });
}

export async function createRoom(input: {
  number: string;
  floor: number;
  roomTypeId: string;
  status?: RoomStatus;
  isActive?: boolean;
  userId: string;
}) {
  const roomType = await prisma.roomType.findUnique({ where: { id: input.roomTypeId } });
  if (!roomType) throw new AppError(404, "CAT-002", "Room type not found");
  const number = input.number.trim();
  const existing = await prisma.room.findUnique({ where: { number } });
  if (existing) throw new AppError(409, "CAT-004", "Room number already exists");

  const room = await prisma.room.create({
    data: {
      number,
      floor: input.floor,
      roomTypeId: input.roomTypeId,
      status: input.status ?? RoomStatus.INSPECTED,
      isActive: input.isActive ?? true,
    },
    include: { roomType: true },
  });
  await audit(input.userId, "Reservations", "ROOM_CREATE", "Room", room.id, { number });
  return room;
}

export async function updateRoom(id: string, input: {
  number?: string;
  floor?: number;
  roomTypeId?: string;
  status?: RoomStatus;
  isActive?: boolean;
  userId: string;
}) {
  const current = await prisma.room.findUnique({ where: { id } });
  if (!current) throw new AppError(404, "CAT-005", "Room not found");
  if (input.roomTypeId) {
    const roomType = await prisma.roomType.findUnique({ where: { id: input.roomTypeId } });
    if (!roomType) throw new AppError(404, "CAT-002", "Room type not found");
  }
  if (input.number && input.number.trim() !== current.number) {
    const clash = await prisma.room.findUnique({ where: { number: input.number.trim() } });
    if (clash) throw new AppError(409, "CAT-004", "Room number already exists");
  }

  const room = await prisma.room.update({
    where: { id },
    data: {
      number: input.number?.trim(),
      floor: input.floor,
      roomTypeId: input.roomTypeId,
      status: input.status,
      isActive: input.isActive,
    },
    include: { roomType: true },
  });
  await audit(input.userId, "Reservations", "ROOM_UPDATE", "Room", id, input);
  return room;
}

// ─── Conference masters ─────────────────────────────────────────────────────

export async function listVenuesAdmin() {
  return prisma.conferenceVenue.findMany({ orderBy: { name: "asc" } });
}

export async function createVenue(input: {
  name: string;
  locationDescription?: string;
  maxCapacityBanquet: number;
  maxCapacityCinema: number;
  maxCapacityBoardroom: number;
  halfDayRate: number;
  fullDayRate: number;
  isActive?: boolean;
  userId: string;
}) {
  const venue = await prisma.conferenceVenue.create({
    data: {
      name: input.name.trim(),
      locationDescription: input.locationDescription?.trim(),
      maxCapacityBanquet: input.maxCapacityBanquet,
      maxCapacityCinema: input.maxCapacityCinema,
      maxCapacityBoardroom: input.maxCapacityBoardroom,
      halfDayRate: input.halfDayRate,
      fullDayRate: input.fullDayRate,
      isActive: input.isActive ?? true,
    },
  });
  await audit(input.userId, "Conference", "VENUE_CREATE", "ConferenceVenue", venue.id);
  return venue;
}

export async function updateVenue(id: string, input: {
  name?: string;
  locationDescription?: string;
  maxCapacityBanquet?: number;
  maxCapacityCinema?: number;
  maxCapacityBoardroom?: number;
  halfDayRate?: number;
  fullDayRate?: number;
  isActive?: boolean;
  userId: string;
}) {
  const current = await prisma.conferenceVenue.findUnique({ where: { id } });
  if (!current) throw new AppError(404, "CAT-010", "Venue not found");
  const venue = await prisma.conferenceVenue.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      locationDescription: input.locationDescription?.trim(),
      maxCapacityBanquet: input.maxCapacityBanquet,
      maxCapacityCinema: input.maxCapacityCinema,
      maxCapacityBoardroom: input.maxCapacityBoardroom,
      halfDayRate: input.halfDayRate,
      fullDayRate: input.fullDayRate,
      isActive: input.isActive,
    },
  });
  await audit(input.userId, "Conference", "VENUE_UPDATE", "ConferenceVenue", id);
  return venue;
}

export async function listPackagesAdmin() {
  return prisma.conferencePackage.findMany({ orderBy: { name: "asc" } });
}

export async function createPackage(input: {
  name: string;
  ratePerPax: number;
  details?: string;
  isActive?: boolean;
  userId: string;
}) {
  const pkg = await prisma.conferencePackage.create({
    data: {
      name: input.name.trim(),
      ratePerPax: input.ratePerPax,
      details: input.details ? { notes: input.details } : undefined,
      isActive: input.isActive ?? true,
    },
  });
  await audit(input.userId, "Conference", "PACKAGE_CREATE", "ConferencePackage", pkg.id);
  return pkg;
}

export async function updatePackage(id: string, input: {
  name?: string;
  ratePerPax?: number;
  details?: string;
  isActive?: boolean;
  userId: string;
}) {
  const current = await prisma.conferencePackage.findUnique({ where: { id } });
  if (!current) throw new AppError(404, "CAT-011", "Package not found");
  const pkg = await prisma.conferencePackage.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      ratePerPax: input.ratePerPax,
      details: input.details !== undefined ? { notes: input.details } : undefined,
      isActive: input.isActive,
    },
  });
  await audit(input.userId, "Conference", "PACKAGE_UPDATE", "ConferencePackage", id);
  return pkg;
}

export async function listResourcesAdmin() {
  return prisma.conferenceResource.findMany({ orderBy: { name: "asc" } });
}

export async function createResource(input: {
  name: string;
  totalInventoryCount: number;
  dailyRentalRate: number;
  category: ConferenceResourceCategory;
  userId: string;
}) {
  const resource = await prisma.conferenceResource.create({
    data: {
      name: input.name.trim(),
      totalInventoryCount: input.totalInventoryCount,
      dailyRentalRate: input.dailyRentalRate,
      category: input.category,
    },
  });
  await audit(input.userId, "Conference", "RESOURCE_CREATE", "ConferenceResource", resource.id);
  return resource;
}

export async function updateResource(id: string, input: {
  name?: string;
  totalInventoryCount?: number;
  dailyRentalRate?: number;
  category?: ConferenceResourceCategory;
  userId: string;
}) {
  const current = await prisma.conferenceResource.findUnique({ where: { id } });
  if (!current) throw new AppError(404, "CAT-012", "Resource not found");
  const resource = await prisma.conferenceResource.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      totalInventoryCount: input.totalInventoryCount,
      dailyRentalRate: input.dailyRentalRate,
      category: input.category,
    },
  });
  await audit(input.userId, "Conference", "RESOURCE_UPDATE", "ConferenceResource", id);
  return resource;
}

// ─── POS menu / meals ───────────────────────────────────────────────────────

export async function listOutletsAdmin() {
  return prisma.posOutlet.findMany({
    include: {
      menuItems: { orderBy: [{ category: "asc" }, { name: "asc" }] },
      _count: { select: { menuItems: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function createOutlet(input: { code: string; name: string; isActive?: boolean; userId: string }) {
  const code = input.code.trim().toUpperCase();
  const existing = await prisma.posOutlet.findUnique({ where: { code } });
  if (existing) throw new AppError(409, "CAT-020", "Outlet code already exists");
  const outlet = await prisma.posOutlet.create({
    data: { code, name: input.name.trim(), isActive: input.isActive ?? true },
  });
  await audit(input.userId, "POS", "OUTLET_CREATE", "PosOutlet", outlet.id);
  return outlet;
}

export async function updateOutlet(id: string, input: { name?: string; isActive?: boolean; userId: string }) {
  const current = await prisma.posOutlet.findUnique({ where: { id } });
  if (!current) throw new AppError(404, "CAT-021", "Outlet not found");
  const outlet = await prisma.posOutlet.update({
    where: { id },
    data: { name: input.name?.trim(), isActive: input.isActive },
  });
  await audit(input.userId, "POS", "OUTLET_UPDATE", "PosOutlet", id);
  return outlet;
}

export async function listMenuItemsAdmin(outletId?: string) {
  return prisma.menuItem.findMany({
    where: outletId ? { outletId } : undefined,
    include: { outlet: { select: { id: true, code: true, name: true } } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export async function createMenuItem(input: {
  outletId: string;
  code: string;
  name: string;
  category: string;
  price: number;
  cost?: number;
  taxRate?: number;
  mealPeriod?: string;
  isActive?: boolean;
  userId: string;
}) {
  const outlet = await prisma.posOutlet.findUnique({ where: { id: input.outletId } });
  if (!outlet) throw new AppError(404, "CAT-021", "Outlet not found");
  const code = input.code.trim().toUpperCase();
  const existing = await prisma.menuItem.findUnique({ where: { code } });
  if (existing) throw new AppError(409, "CAT-022", "Menu item code already exists");

  const item = await prisma.menuItem.create({
    data: {
      outletId: input.outletId,
      code,
      name: input.name.trim(),
      category: input.category.trim(),
      price: input.price,
      cost: input.cost ?? 0,
      taxRate: input.taxRate ?? 0.15,
      mealPeriod: input.mealPeriod?.trim() || null,
      isActive: input.isActive ?? true,
    },
    include: { outlet: { select: { id: true, code: true, name: true } } },
  });
  await audit(input.userId, "POS", "MENU_ITEM_CREATE", "MenuItem", item.id, { price: input.price });
  return item;
}

export async function updateMenuItem(id: string, input: {
  outletId?: string;
  name?: string;
  category?: string;
  price?: number;
  cost?: number;
  taxRate?: number;
  mealPeriod?: string | null;
  isActive?: boolean;
  userId: string;
}) {
  const current = await prisma.menuItem.findUnique({ where: { id } });
  if (!current) throw new AppError(404, "CAT-023", "Menu item not found");
  if (input.outletId) {
    const outlet = await prisma.posOutlet.findUnique({ where: { id: input.outletId } });
    if (!outlet) throw new AppError(404, "CAT-021", "Outlet not found");
  }
  const item = await prisma.menuItem.update({
    where: { id },
    data: {
      outletId: input.outletId,
      name: input.name?.trim(),
      category: input.category?.trim(),
      price: input.price,
      cost: input.cost,
      taxRate: input.taxRate,
      mealPeriod: input.mealPeriod === null ? null : input.mealPeriod?.trim(),
      isActive: input.isActive,
    },
    include: { outlet: { select: { id: true, code: true, name: true } } },
  });
  await audit(input.userId, "POS", "MENU_ITEM_UPDATE", "MenuItem", id, input);
  return item;
}

// ─── Guest service / meal catalog ───────────────────────────────────────────

export async function listServiceCatalogAdmin() {
  return prisma.serviceCatalogItem.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
}

export async function createServiceCatalogItem(input: {
  code: string;
  name: string;
  category: string;
  mealPeriod?: string;
  price: number;
  taxRate?: number;
  isActive?: boolean;
  userId: string;
}) {
  const code = input.code.trim().toUpperCase();
  const existing = await prisma.serviceCatalogItem.findUnique({ where: { code } });
  if (existing) throw new AppError(409, "CAT-030", "Catalog code already exists");
  const item = await prisma.serviceCatalogItem.create({
    data: {
      code,
      name: input.name.trim(),
      category: input.category.trim(),
      mealPeriod: input.mealPeriod?.trim() || null,
      price: input.price,
      taxRate: input.taxRate ?? 0.15,
      isActive: input.isActive ?? true,
    },
  });
  await audit(input.userId, "GuestServices", "CATALOG_CREATE", "ServiceCatalogItem", item.id);
  return item;
}

export async function updateServiceCatalogItem(id: string, input: {
  name?: string;
  category?: string;
  mealPeriod?: string | null;
  price?: number;
  taxRate?: number;
  isActive?: boolean;
  userId: string;
}) {
  const current = await prisma.serviceCatalogItem.findUnique({ where: { id } });
  if (!current) throw new AppError(404, "CAT-031", "Catalog item not found");
  const item = await prisma.serviceCatalogItem.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      category: input.category?.trim(),
      mealPeriod: input.mealPeriod === null ? null : input.mealPeriod?.trim(),
      price: input.price,
      taxRate: input.taxRate,
      isActive: input.isActive,
    },
  });
  await audit(input.userId, "GuestServices", "CATALOG_UPDATE", "ServiceCatalogItem", id, input);
  return item;
}
