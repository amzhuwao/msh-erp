import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const items = [
  { name: "Cocktails", category: "Cocktails", price: 5 },
  { name: "Mocktails", category: "Mocktails", price: 3 },
  { name: "Smoothies", category: "Smoothies", price: 4 },
  { name: "Milkshakes", category: "Milkshakes", price: 4 },
  { name: "Bottled Soft Drinks", category: "Soft Drinks", price: 1 },
  { name: "Canned Drinks", category: "Soft Drinks", price: 2 },
  { name: "Petty Drinks", category: "Soft Drinks", price: 2 },
  { name: "Minute Maid", category: "Juices", price: 2 },
  { name: "Santal", category: "Juices", price: 2 },
  { name: "100% Juice (per glass)", category: "Juices", price: 3 },
  { name: "Lemonade", category: "Mixers", price: 1.5 },
  { name: "Club Soda", category: "Mixers", price: 1.5 },
  { name: "Ginger Ale", category: "Mixers", price: 1.5 },
  { name: "Tonic Water", category: "Mixers", price: 1.5 },
  { name: "Red Bull", category: "Mixers", price: 1.5 },
  { name: "Dragon", category: "Mixers", price: 2 },
  { name: "Black Label", category: "Beers", price: 1.5 },
  { name: "Castle Lager", category: "Beers", price: 1.5, aliases: ["Castle Lager 500ml"] },
  { name: "Castle Lite", category: "Beers", price: 1.5 },
  { name: "Zambezi", category: "Beers", price: 1.5, aliases: ["Zambezi Lager 500ml"] },
  { name: "Windhoek Draught", category: "Beers", price: 2.5 },
  { name: "Heineken", category: "Beers", price: 2.5, aliases: ["Heineken 330ml"] },
  { name: "Corona Extra", category: "Beers", price: 2.5 },
  { name: "Stella Artois", category: "Beers", price: 2.5 },
  { name: "Savanna Dry", category: "Ciders", price: 2.5 },
  { name: "Hunters Dry", category: "Ciders", price: 2.5 },
  { name: "Hunters Gold", category: "Ciders", price: 2.5 },
  { name: "Brutal Fruit", category: "Ciders", price: 2.5 },
  { name: "Belgravia", category: "Ciders", price: 2.5 },
  { name: "Famous Grouse", category: "Whisky", price: 2 },
  { name: "Grants", category: "Whisky", price: 2 },
  { name: "Jack Daniel's", category: "Whisky", price: 3 },
  { name: "Johnnie Walker Red", category: "Whisky", price: 3 },
  { name: "Johnnie Walker Black", category: "Whisky", price: 4 },
  { name: "Chivas Regal", category: "Whisky", price: 4 },
  { name: "Johnnie Walker Double Black", category: "Whisky", price: 5 },
  { name: "Glenfiddich 12 Years", category: "Whisky", price: 5, aliases: ["Glenfiddich"] },
  { name: "Glenfiddich 15 Years", category: "Whisky", price: 8 },
  { name: "Glenfiddich 18 Years", category: "Whisky", price: 10 },
  { name: "Amarula", category: "Liqueurs & Brandy", price: 1.5 },
  { name: "Strawberry Lips", category: "Liqueurs & Brandy", price: 1.5 },
  { name: "Viceroy", category: "Liqueurs & Brandy", price: 1.5 },
  { name: "Southern Comfort", category: "Liqueurs & Brandy", price: 2 },
  { name: "Jägermeister", category: "Liqueurs & Brandy", price: 3 },
  { name: "Hennessy Very Special", category: "Liqueurs & Brandy", price: 5 },
  { name: "Gordon's Dry Gin", category: "Gin & Vodka", price: 2 },
  { name: "Smirnoff Vodka", category: "Gin & Vodka", price: 2 },
  { name: "Tanqueray London Dry Gin", category: "Gin & Vodka", price: 3 },
  { name: "Captain Morgan", category: "Rum & Tequila", price: 2 },
  { name: "Bacardi Gold", category: "Rum & Tequila", price: 2 },
  { name: "Tequila Silver / Gold", category: "Rum & Tequila", price: 2 },
  { name: "Wine by the Glass", category: "Wines", price: 4, aliases: ["House wine glass"] },
  { name: "4th Street", category: "Wines", price: 15, aliases: ["4th Street Wines (Bottles)"] },
  { name: "Nederburg", category: "Wines", price: 20, aliases: ["Nederberg Wines (Bottles)"] },
  { name: "KWV", category: "Wines", price: 20 },
  { name: "Protea", category: "Wines", price: 20 },
  { name: "Sparkling Wine (non-alcoholic)", category: "Wines", price: 15 },
  { name: "Biltong", category: "Snacks", price: 0.5 },
  { name: "Pascal Chocolates", category: "Snacks", price: 0.5 },
  { name: "Roasted Corn (2 pieces)", category: "Snacks", price: 0.5 },
  { name: "Lays", category: "Snacks", price: 1 },
  { name: "Roasted Nuts", category: "Snacks", price: 1 },
] as const;

function normalizeName(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function menuCode(name: string) {
  const slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `BAR26-${slug}`;
}

async function main() {
  const outlet = await prisma.posOutlet.findFirst({ where: { name: { equals: "Bar", mode: "insensitive" } } });
  if (!outlet) throw new Error("The Bar POS outlet does not exist; no menu items were changed.");

  const property = await prisma.propertyConfiguration.findFirst({ select: { vatRatePercent: true } });
  const taxRate = Number(property?.vatRatePercent ?? 15) / 100;
  const existingItems = await prisma.menuItem.findMany({ where: { outletId: outlet.id } });
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
      const collision = await tx.menuItem.findUnique({ where: { code }, select: { id: true, outletId: true, name: true } });
      if (collision && collision.outletId !== outlet.id) {
        throw new Error(`Menu code ${code} belongs to another outlet; sync stopped without saving.`);
      }
      if (collision) {
        includedExistingIds.add(collision.id);
        await tx.menuItem.update({ where: { id: collision.id }, data });
        updated += 1;
      } else {
        const createdItem = await tx.menuItem.create({
          data: { ...data, code, cost: new Prisma.Decimal(0) },
        });
        includedExistingIds.add(createdItem.id);
        created += 1;
      }
    }

    await tx.menuItem.updateMany({
      where: { outletId: outlet.id, isActive: true, id: { notIn: [...includedExistingIds] } },
      data: { isActive: false },
    });
  });

  const activeCount = await prisma.menuItem.count({ where: { outletId: outlet.id, isActive: true } });
  console.log(JSON.stringify({ outlet: outlet.name, menuItems: items.length, created, updated, activeItems: activeCount, taxRatePercent: taxRate * 100 }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
