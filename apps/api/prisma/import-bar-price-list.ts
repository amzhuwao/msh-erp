import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const items = [
  { name: "Bottled Soft Drinks", category: "Soft Drinks", price: 1, aliases: ["Soft drink"] },
  { name: "Canned Drinks", category: "Soft Drinks", price: 2 },
  { name: "Petty Drinks", category: "Soft Drinks", price: 2 },
  { name: "Minute Maid", category: "Soft Drinks", price: 2 },
  { name: "100% Juice (per glass)", category: "Soft Drinks", price: 3 },
  { name: "Mocktails", category: "Cocktails & Mocktails", price: 3 },
  { name: "Cocktails", category: "Cocktails & Mocktails", price: 5 },
  { name: "Smoothies", category: "Smoothies & Milkshakes", price: 4 },
  { name: "Milkshakes", category: "Smoothies & Milkshakes", price: 4 },
  { name: "Lemonade", category: "Mixers", price: 1.5 },
  { name: "Club Soda", category: "Mixers", price: 1.5 },
  { name: "Red Bull", category: "Mixers", price: 1.5 },
  { name: "Ginger Ale", category: "Mixers", price: 1.5 },
  { name: "Tonic Water", category: "Mixers", price: 1.5 },
  { name: "Savanna Dry", category: "Ciders", price: 2.5 },
  { name: "Hunters Dry", category: "Ciders", price: 2.5 },
  { name: "Hunters Gold", category: "Ciders", price: 2.5 },
  { name: "Brutal Fruit", category: "Ciders", price: 2.5 },
  { name: "Black Label", category: "Beers", price: 1.5 },
  { name: "Castle Lager", category: "Beers", price: 1.5, aliases: ["Castle Lager 500ml"] },
  { name: "Castle Lite", category: "Beers", price: 1.5 },
  { name: "Zambezi", category: "Beers", price: 1.5, aliases: ["Zambezi Lager 500ml"] },
  { name: "Windhoek Draught", category: "Beers", price: 2.5 },
  { name: "Heineken", category: "Beers", price: 2.5, aliases: ["Heineken 330ml"] },
  { name: "Corona Extra", category: "Beers", price: 2.5 },
  { name: "Amarula", category: "Whiskey, Vodka, Liqueurs, Spirits & Gin", price: 1.5 },
  { name: "Strawberry Lips", category: "Whiskey, Vodka, Liqueurs, Spirits & Gin", price: 1.5 },
  { name: "Viceroy", category: "Whiskey, Vodka, Liqueurs, Spirits & Gin", price: 1.5 },
  { name: "Tequila Silver", category: "Whiskey, Vodka, Liqueurs, Spirits & Gin", price: 2 },
  { name: "Tequila Gold", category: "Whiskey, Vodka, Liqueurs, Spirits & Gin", price: 2 },
  { name: "Captain Morgan", category: "Whiskey, Vodka, Liqueurs, Spirits & Gin", price: 2 },
  { name: "Bacardi Gold", category: "Whiskey, Vodka, Liqueurs, Spirits & Gin", price: 2 },
  { name: "Famous Grouse", category: "Whiskey, Vodka, Liqueurs, Spirits & Gin", price: 2 },
  { name: "Southern Comfort", category: "Whiskey, Vodka, Liqueurs, Spirits & Gin", price: 2 },
  { name: "Gordon's Dry Gin", category: "Whiskey, Vodka, Liqueurs, Spirits & Gin", price: 2 },
  { name: "Smirnoff Vodka", category: "Whiskey, Vodka, Liqueurs, Spirits & Gin", price: 2 },
  { name: "Grants", category: "Whiskey, Vodka, Liqueurs, Spirits & Gin", price: 2 },
  { name: "Jack Daniel's", category: "Whiskey, Vodka, Liqueurs, Spirits & Gin", price: 3 },
  { name: "Johnnie Walker Red", category: "Whiskey, Vodka, Liqueurs, Spirits & Gin", price: 3 },
  { name: "Jägermeister", category: "Whiskey, Vodka, Liqueurs, Spirits & Gin", price: 3 },
  { name: "Johnnie Walker Black", category: "Whiskey, Vodka, Liqueurs, Spirits & Gin", price: 4 },
  { name: "Chivas Regal", category: "Whiskey, Vodka, Liqueurs, Spirits & Gin", price: 4 },
  { name: "Johnnie Walker Double Black", category: "Whiskey, Vodka, Liqueurs, Spirits & Gin", price: 5 },
  { name: "Glenfiddich", category: "Whiskey, Vodka, Liqueurs, Spirits & Gin", price: 6 },
  { name: "4th Street Wines (Bottles)", category: "Wines", price: 12 },
  { name: "Nederberg Wines (Bottles)", category: "Wines", price: 12 },
  { name: "Wine by the Glass", category: "Wines", price: 3, aliases: ["House wine glass"] },
] as const;

function normalizeName(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function menuCode(name: string) {
  const slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `BAR25-${slug}`;
}

async function main() {
  const outlet = await prisma.posOutlet.findFirst({ where: { name: { equals: "Bar", mode: "insensitive" } } })
    ?? await prisma.posOutlet.findUnique({ where: { code: "LOUNGE" } });
  if (!outlet) throw new Error("The Bar POS outlet does not exist; no menu items were imported.");
  const restaurant = await prisma.posOutlet.findFirst({ where: { name: { contains: "Restaurant", mode: "insensitive" } } })
    ?? await prisma.posOutlet.findUnique({ where: { code: "LOUNGE" } });
  if (!restaurant || restaurant.id === outlet.id) throw new Error("A separate restaurant POS outlet is required to organize the menus.");
  const property = await prisma.propertyConfiguration.findFirst({ select: { vatRatePercent: true } });
  const taxRate = Number(property?.vatRatePercent ?? 15) / 100;
  const existingItems = await prisma.menuItem.findMany();
  const byName = new Map(existingItems.map((item) => [normalizeName(item.name), item]));
  const includedExistingIds = new Set<string>();
  let created = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    for (const entry of items) {
      const aliases = "aliases" in entry ? entry.aliases : [];
      const candidates = [entry.name, ...aliases].map(normalizeName);
      const current = candidates.map((candidate) => byName.get(candidate)).find(Boolean);
      const data = {
        outletId: outlet.id,
        name: entry.name,
        category: entry.category,
        price: new Prisma.Decimal(entry.price),
        taxRate: new Prisma.Decimal(taxRate),
        isActive: true,
      };

      if (current) {
        includedExistingIds.add(current.id);
        await tx.menuItem.update({ where: { id: current.id }, data });
        updated += 1;
        continue;
      }

      const code = menuCode(entry.name);
      const codeCollision = await tx.menuItem.findUnique({ where: { code }, select: { id: true, outletId: true } });
      if (codeCollision) {
        const codeItem = await tx.menuItem.findUnique({ where: { id: codeCollision.id }, select: { name: true } });
        if (normalizeName(codeItem?.name ?? "") !== normalizeName(entry.name)) {
          throw new Error(`Menu code ${code} is already used by a different item; import stopped without saving.`);
        }
        includedExistingIds.add(codeCollision.id);
        await tx.menuItem.update({ where: { id: codeCollision.id }, data });
        updated += 1;
      } else {
        const createdItem = await tx.menuItem.create({
          data: { ...data, outletId: outlet.id, code, cost: new Prisma.Decimal(0) },
        });
        includedExistingIds.add(createdItem.id);
        created += 1;
      }
    }

    // Keep historical order items intact while removing unmatched sample
    // bar products from the active POS menu.
    await tx.menuItem.updateMany({
      where: { outletId: restaurant.id, category: "Bar", isActive: true, id: { notIn: [...includedExistingIds] } },
      data: { isActive: false },
    });
    const foodItemsMoved = await tx.menuItem.updateMany({
      where: { outletId: outlet.id, category: { in: ["Breakfast", "Lunch", "Dinner", "Desserts"] } },
      data: { outletId: restaurant.id },
    });
    await tx.menuItem.updateMany({
      where: { outletId: restaurant.id, category: { in: ["Lunch", "Dinner"] } },
      data: { category: "À la carte" },
    });
    const snackItemsMoved = await tx.menuItem.updateMany({
      where: { outletId: restaurant.id, category: "Snacks" },
      data: { outletId: outlet.id },
    });
    console.log(JSON.stringify({ movedFoodItemsToRestaurant: foodItemsMoved.count, movedSnackItemsToBar: snackItemsMoved.count }));
  });

  const activeCount = await prisma.menuItem.count({ where: { outletId: outlet.id, isActive: true } });
  console.log(JSON.stringify({ outlet: outlet.name, imported: items.length, created, updated, activeMenuItems: activeCount, taxRatePercent: taxRate * 100 }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
