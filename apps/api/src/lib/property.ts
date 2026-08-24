import { prisma } from "./prisma.js";

export async function getProperty() {
  const property = await prisma.propertyConfiguration.findFirst();
  if (!property) {
    return {
      id: "",
      propertyName: "Manica Skyview Hotel",
      address: "No. 77 Second Street, Cnr Seventh Avenue, Mutare, Zimbabwe",
      vatNumber: "MSH-VAT-001",
      bpNumber: null as string | null,
      primaryCurrency: "USD",
      contactEmail: "info@manicaskyview.co.zw",
      contactPhone: "+263 20 206 6101",
      netoneNumber: null as string | null,
      whatsappNumber: "+263 78 640 7580",
      receptionEmail: "reception@manicaskyview.co.zw",
      checkInTime: "14:00",
      checkOutTime: "10:00",
      logoUrl: null as string | null,
      bankName: "CBZ Bank",
      bankBranch: "Mutare",
      bankAccountName: "Manica Skyview Hotel",
      bankAccountNumber: null as string | null,
      bankSwiftCode: "COBZZWHA",
      ecocashNumber: null as string | null,
      ecocashMerchant: null as string | null,
      onemoneyNumber: null as string | null,
    };
  }
  return property;
}

export function paymentInstructions(property: Awaited<ReturnType<typeof getProperty>>) {
  return {
    bankTransfer: {
      bankName: property.bankName,
      branch: property.bankBranch,
      accountName: property.bankAccountName,
      accountNumber: property.bankAccountNumber,
      swiftCode: property.bankSwiftCode,
      referenceNote: "Use the reservation or invoice number as the payment reference.",
    },
    ecocash: {
      number: property.ecocashNumber,
      merchant: property.ecocashMerchant,
    },
    onemoney: {
      number: property.onemoneyNumber ?? property.netoneNumber,
    },
  };
}
