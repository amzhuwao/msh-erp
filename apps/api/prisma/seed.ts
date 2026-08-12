import bcrypt from "bcryptjs";
import {
  DocumentModule,
  PrismaClient,
  RoomStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

const receptionistPermissions = {
  Reservations: ["VIEW", "CREATE", "EDIT", "CANCEL"],
  GroupReservations: ["VIEW", "CREATE", "EDIT"],
  Housekeeping: ["VIEW"],
  POS: ["VIEW", "CREATE"],
  Finance: ["VIEW_LIMITED"],
};

const supervisorPermissions = {
  ...receptionistPermissions,
  Reservations: ["VIEW", "CREATE", "EDIT", "CANCEL", "OVERRIDE"],
  GroupReservations: ["VIEW", "CREATE", "EDIT", "CANCEL"],
  Housekeeping: ["VIEW", "EDIT"],
  POS: ["VIEW", "CREATE", "EDIT"],
  Finance: ["VIEW"],
};

const adminPermissions = {
  Auth: ["VIEW", "CREATE", "EDIT", "DELETE"],
  Reservations: ["VIEW", "CREATE", "EDIT", "DELETE", "CANCEL", "OVERRIDE", "EXPORT"],
  GroupReservations: ["VIEW", "CREATE", "EDIT", "DELETE", "CANCEL", "OVERRIDE", "EXPORT"],
  Housekeeping: ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE"],
  POS: ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE"],
  Finance: ["VIEW", "CREATE", "EDIT", "APPROVE", "EXPORT"],
  Admin: ["VIEW", "CREATE", "EDIT", "DELETE"],
};

async function main() {
  console.log("Seeding Manica Skyview Hotel ERP...");

  await prisma.housekeepingAssignment.deleteMany();
  await prisma.posOrderItem.deleteMany();
  await prisma.posOrder.deleteMany();
  await prisma.posSession.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.posOutlet.deleteMany();
  await prisma.generalLedgerLine.deleteMany();
  await prisma.generalLedgerEntry.deleteMany();
  await prisma.accountingPeriod.deleteMany();
  await prisma.chartOfAccount.deleteMany();
  await prisma.groupCharge.deleteMany();
  await prisma.groupInvoice.deleteMany();
  await prisma.groupGuest.deleteMany();
  await prisma.groupRoom.deleteMany();
  await prisma.groupReservation.deleteMany();
  await prisma.corporateProfile.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.folioLine.deleteMany();
  await prisma.folio.deleteMany();
  await prisma.reservationStatusHistory.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.ratePlan.deleteMany();
  await prisma.room.deleteMany();
  await prisma.roomType.deleteMany();
  await prisma.permissionOverride.deleteMany();
  await prisma.userGroupMember.deleteMany();
  await prisma.userGroup.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.department.deleteMany();
  await prisma.documentNumberingPattern.deleteMany();
  await prisma.taxRateDefinition.deleteMany();
  await prisma.globalSetting.deleteMany();
  await prisma.propertyConfiguration.deleteMany();

  const property = await prisma.propertyConfiguration.create({
    data: {
      propertyName: "Manica Skyview Hotel",
      address: "Mutare, Manicaland, Zimbabwe",
      vatNumber: "MSH-VAT-001",
      primaryCurrency: "USD",
      contactEmail: "info@manicaskyview.co.zw",
      contactPhone: "+263 20 60000",
      checkInTime: "14:00",
      checkOutTime: "10:00",
    },
  });

  await prisma.globalSetting.createMany({
    data: [
      { key: "SYS_CHECKIN_TIME", value: "14:00", description: "Standard check-in time", isSystemLocked: true },
      { key: "SYS_CHECKOUT_TIME", value: "10:00", description: "Standard check-out time", isSystemLocked: true },
      { key: "SYS_SESSION_TIMEOUT", value: "20", description: "Session timeout in minutes", isSystemLocked: true },
    ],
  });

  await prisma.documentNumberingPattern.create({
    data: {
      module: DocumentModule.RESERVATIONS,
      prefix: "MSV-RES-2026-",
      currentSequence: 1,
      paddingDigits: 4,
    },
  });

  await prisma.documentNumberingPattern.create({
    data: {
      module: DocumentModule.GROUP_RESERVATIONS,
      prefix: "MSV-GRP-2026-",
      currentSequence: 1,
      paddingDigits: 4,
    },
  });

  await prisma.documentNumberingPattern.create({
    data: {
      module: DocumentModule.POS_ORDERS,
      prefix: "POS-2026-",
      currentSequence: 1,
      paddingDigits: 6,
    },
  });

  await prisma.documentNumberingPattern.create({
    data: {
      module: DocumentModule.GL_ENTRIES,
      prefix: "GL-2026-",
      currentSequence: 1,
      paddingDigits: 6,
    },
  });

  await prisma.taxRateDefinition.createMany({
    data: [
      { name: "VAT 15%", code: "VAT_15", ratePercent: 0.15, isActive: true },
      { name: "Tourism Levy 2%", code: "TOURISM_2", ratePercent: 0.02, isActive: true },
    ],
  });

  const frontOffice = await prisma.department.create({
    data: { name: "Front Office" },
  });

  const housekeeping = await prisma.department.create({
    data: { name: "Housekeeping" },
  });

  const salesDept = await prisma.department.create({
    data: { name: "Sales & Marketing" },
  });

  const adminRole = await prisma.role.create({
    data: {
      name: "System Administrator",
      description: "Full system configuration access",
      permissions: adminPermissions,
    },
  });

  const supervisorRole = await prisma.role.create({
    data: {
      name: "Front Office Supervisor",
      description: "Front office supervisor with override privileges",
      permissions: supervisorPermissions,
    },
  });

  const receptionistRole = await prisma.role.create({
    data: {
      name: "Receptionist",
      description: "Front desk receptionist",
      permissions: receptionistPermissions,
    },
  });

  const passwordHash = await bcrypt.hash("Admin@MSH2026!", 12);

  await prisma.user.create({
    data: {
      username: "admin",
      email: "admin@manicaskyview.co.zw",
      passwordHash,
      fullName: "MSH System Administrator",
      departmentId: frontOffice.id,
      roleId: adminRole.id,
    },
  });

  await prisma.user.create({
    data: {
      username: "reception",
      email: "reception@manicaskyview.co.zw",
      passwordHash: await bcrypt.hash("Reception@MSH2026!", 12),
      fullName: "Front Desk Reception",
      departmentId: frontOffice.id,
      roleId: receptionistRole.id,
    },
  });

  await prisma.user.create({
    data: {
      username: "fosupervisor",
      email: "fo.supervisor@manicaskyview.co.zw",
      passwordHash: await bcrypt.hash("Supervisor@MSH2026!", 12),
      fullName: "Front Office Supervisor",
      departmentId: frontOffice.id,
      roleId: supervisorRole.id,
    },
  });

  const roomTypeData = [
    { code: "STD", name: "Standard Room", maxAdults: 2, maxChildren: 1, baseRate: 85, count: 12 },
    { code: "DLX", name: "Deluxe Room", maxAdults: 2, maxChildren: 2, baseRate: 120, count: 8 },
    { code: "STE", name: "Executive Suite", maxAdults: 3, maxChildren: 2, baseRate: 195, count: 4 },
    { code: "FAM", name: "Family Room", maxAdults: 4, maxChildren: 3, baseRate: 150, count: 6 },
  ];

  let roomNumber = 101;
  for (const rt of roomTypeData) {
    const roomType = await prisma.roomType.create({
      data: {
        code: rt.code,
        name: rt.name,
        description: `${rt.name} at Manica Skyview Hotel`,
        maxAdults: rt.maxAdults,
        maxChildren: rt.maxChildren,
        baseRate: rt.baseRate,
      },
    });

    await prisma.ratePlan.create({
      data: {
        code: `${rt.code}-BAR`,
        name: `${rt.name} Best Available Rate`,
        roomTypeId: roomType.id,
        baseRate: rt.baseRate,
      },
    });

    for (let i = 0; i < rt.count; i++) {
      const floor = Math.floor(roomNumber / 100);
      await prisma.room.create({
        data: {
          number: String(roomNumber),
          floor,
          roomTypeId: roomType.id,
          status: RoomStatus.INSPECTED,
        },
      });
      roomNumber += 1;
      if (roomNumber % 100 > 20) {
        roomNumber = (floor + 1) * 100 + 1;
      }
    }
  }

  await prisma.user.create({
    data: {
      username: "housekeeping",
      email: "housekeeping@manicaskyview.co.zw",
      passwordHash: await bcrypt.hash("Housekeeping@MSH2026!", 12),
      fullName: "Housekeeping Supervisor",
      departmentId: housekeeping.id,
      roleId: supervisorRole.id,
    },
  });
  await prisma.user.create({
    data: {
      username: "sales",
      email: "sales@manicaskyview.co.zw",
      passwordHash: await bcrypt.hash("Sales@MSH2026!", 12),
      fullName: "Sales Coordinator",
      departmentId: salesDept.id,
      roleId: supervisorRole.id,
    },
  });

  const minOfHealth = await prisma.corporateProfile.create({
    data: {
      companyName: "Ministry of Health — Manicaland",
      registrationNumber: "GOV-MOH-MAN-001",
      contactName: "T. Moyo",
      contactEmail: "bookings@health.gov.zw",
      phone: "+263 20 12345",
      creditLimit: 50000,
      isCreditApproved: true,
    },
  });

  await prisma.corporateProfile.create({
    data: {
      companyName: "Zimbabwe Mining Consortium",
      registrationNumber: "ZMC-2019-442",
      contactName: "R. Chikwanha",
      contactEmail: "travel@zmc.co.zw",
      phone: "+263 772 000111",
      creditLimit: 25000,
      isCreditApproved: true,
    },
  });

  // Sample tentative group booking
  const adminUser = await prisma.user.findUnique({ where: { username: "admin" } });
  if (adminUser) {
    const stdRooms = await prisma.room.findMany({
      where: { roomType: { code: "STD" } },
      take: 3,
      orderBy: { number: "asc" },
    });
    const dlxRoom = await prisma.room.findFirst({ where: { roomType: { code: "DLX" } } });

    const group = await prisma.groupReservation.create({
      data: {
        groupCode: "MSV-GRP-2026-0001",
        groupName: "MOH Annual Conference Delegates",
        companyId: minOfHealth.id,
        contactPerson: "T. Moyo",
        phone: "+263 20 12345",
        email: "bookings@health.gov.zw",
        arrivalDate: new Date("2026-09-01"),
        departureDate: new Date("2026-09-05"),
        adults: 40,
        children: 0,
        roomCount: 3,
        status: "CONFIRMED",
        depositAmount: 5000,
        specialRequests: "Late checkout on final day, conference shuttle required",
        createdById: adminUser.id,
        guests: {
          create: [
            {
              fullName: "Dr. Grace Mutasa",
              nationality: "Zimbabwe",
              nationalId: "63-1234567A12",
              roomTypeCode: "DLX",
              vipStatus: "VIP1",
            },
            {
              fullName: "Mr. Peter Ndlovu",
              nationality: "Zimbabwe",
              nationalId: "63-9876543B45",
              roomTypeCode: "STD",
            },
            {
              fullName: "Ms. Sarah Chiteve",
              nationality: "Zimbabwe",
              passportNumber: "AE1234567",
              roomTypeCode: "STD",
            },
          ],
        },
      },
    });

    const allocations = [
      { room: dlxRoom, rate: 120, guest: "Dr. Grace Mutasa" },
      { room: stdRooms[0], rate: 85, guest: "Mr. Peter Ndlovu" },
      { room: stdRooms[1], rate: 85, guest: "Ms. Sarah Chiteve" },
    ].filter((a) => a.room);

    for (const alloc of allocations) {
      await prisma.groupRoom.create({
        data: {
          groupReservationId: group.id,
          roomId: alloc.room!.id,
          roomTypeId: alloc.room!.roomTypeId,
          rate: alloc.rate,
          assignedGuestName: alloc.guest,
          status: "BLOCKED",
        },
      });
    }

    await prisma.documentNumberingPattern.update({
      where: { module: DocumentModule.GROUP_RESERVATIONS },
      data: { currentSequence: 2 },
    });
  }

  // Chart of Accounts
  const coaData = [
    { accountCode: "1100", accountName: "Cash Clearing", accountType: "ASSET" as const },
    { accountCode: "1200", accountName: "Guest Ledger", accountType: "ASSET" as const },
    { accountCode: "1300", accountName: "Accounts Receivable", accountType: "ASSET" as const },
    { accountCode: "2200", accountName: "VAT Output Liability", accountType: "LIABILITY" as const },
    { accountCode: "4100", accountName: "Room Revenue", accountType: "REVENUE" as const },
    { accountCode: "4200", accountName: "Food & Beverage Revenue", accountType: "REVENUE" as const },
    { accountCode: "5100", accountName: "Operating Expenses", accountType: "EXPENSE" as const },
  ];
  for (const acct of coaData) {
    await prisma.chartOfAccount.create({ data: acct });
  }

  const now = new Date();
  await prisma.accountingPeriod.create({
    data: { year: now.getFullYear(), month: now.getMonth() + 1, status: "OPEN" },
  });

  // POS outlets and menu
  const restaurant = await prisma.posOutlet.create({
    data: { code: "RESTAURANT", name: "Terrace Restaurant" },
  });
  const lounge = await prisma.posOutlet.create({
    data: { code: "LOUNGE", name: "Skyview Lounge" },
  });

  const menuItems = [
    { outletId: restaurant.id, code: "BRK-001", name: "Full English Breakfast", category: "Breakfast", price: 12, cost: 4 },
    { outletId: restaurant.id, code: "MNS-001", name: "Grilled Beef Steak", category: "Mains", price: 22, cost: 9 },
    { outletId: restaurant.id, code: "MNS-002", name: "Grilled Tilapia", category: "Mains", price: 18, cost: 7 },
    { outletId: restaurant.id, code: "DSR-001", name: "Chocolate Mousse", category: "Desserts", price: 8, cost: 2.5 },
    { outletId: lounge.id, code: "BEV-001", name: "Local Lager 500ml", category: "Beverages", price: 4, cost: 1.2 },
    { outletId: lounge.id, code: "BEV-002", name: "House Wine Glass", category: "Beverages", price: 6, cost: 2 },
    { outletId: lounge.id, code: "SNK-001", name: "Mixed Nuts Bowl", category: "Snacks", price: 5, cost: 1.5 },
  ];
  await prisma.menuItem.createMany({ data: menuItems });

  console.log("Seed complete.");
  console.log(`Property: ${property.propertyName}`);
  console.log("Default logins:");
  console.log("  admin / Admin@MSH2026!");
  console.log("  reception / Reception@MSH2026!");
  console.log("  fosupervisor / Supervisor@MSH2026!");
  console.log("  housekeeping / Housekeeping@MSH2026!");
  console.log("  sales / Sales@MSH2026!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
