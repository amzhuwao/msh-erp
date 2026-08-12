import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { DocumentModule } from "@prisma/client";

export async function nextDocumentNumber(module: DocumentModule): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const pattern = await tx.documentNumberingPattern.findUniqueOrThrow({
      where: { module },
    });

    const sequence = pattern.currentSequence;
    const padded = String(sequence).padStart(pattern.paddingDigits, "0");
    const number = `${pattern.prefix}${padded}${pattern.suffix ?? ""}`;

    await tx.documentNumberingPattern.update({
      where: { module },
      data: { currentSequence: sequence + 1 },
    });

    return number;
  });
}

export async function writeAuditLog(input: {
  userId?: string;
  module: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Prisma.InputJsonValue;
  ipAddress?: string;
}) {
  await prisma.auditLog.create({ data: input });
}
