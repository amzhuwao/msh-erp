import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { writeAuditLog } from "./system.service.js";

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function maskPayload(raw: string) {
  return raw
    .replace(/\b(\d{6})\d+(\d{4})\b/g, "$1******$2")
    .replace(/("password"\s*:\s*")[^"]+"/gi, '$1***"');
}

export async function createApiKey(input: {
  clientName: string;
  scopes: string[];
  expiresAt?: string;
  userId: string;
}) {
  const token = `msh_${crypto.randomBytes(24).toString("hex")}`;
  const secret = crypto.randomBytes(32).toString("hex");
  const record = await prisma.apiKeyCredential.create({
    data: {
      clientName: input.clientName,
      tokenHash: hash(token),
      secretKeyHash: hash(secret),
      tokenPrefix: token.slice(0, 12),
      scopes: input.scopes,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
    },
  });
  await writeAuditLog({
    userId: input.userId,
    module: "Integrations",
    action: "API_KEY_CREATED",
    entityType: "ApiKeyCredential",
    entityId: record.id,
    details: { clientName: input.clientName },
  });
  return { id: record.id, clientName: record.clientName, token, secret, scopes: input.scopes };
}

export async function listApiKeys() {
  return prisma.apiKeyCredential.findMany({
    select: {
      id: true,
      clientName: true,
      tokenPrefix: true,
      scopes: true,
      isActive: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createWebhook(input: { eventName: string; targetUrl: string; userId: string }) {
  const secretToken = crypto.randomBytes(24).toString("hex");
  const webhook = await prisma.integrationWebhook.create({
    data: { eventName: input.eventName, targetUrl: input.targetUrl, secretToken },
  });
  await writeAuditLog({
    userId: input.userId,
    module: "Integrations",
    action: "WEBHOOK_MODIFIED",
    entityType: "IntegrationWebhook",
    entityId: webhook.id,
  });
  return webhook;
}

export async function listWebhooks() {
  return prisma.integrationWebhook.findMany({ orderBy: { createdAt: "desc" } });
}

export async function listLogs(statusCode?: number) {
  return prisma.apiIntegrationLog.findMany({
    where: statusCode ? { statusCode } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function logIntegration(input: {
  endpoint: string;
  httpMethod: string;
  requestPayload?: unknown;
  responsePayload?: unknown;
  statusCode: number;
  responseTimeMs: number;
  ipAddress?: string;
}) {
  return prisma.apiIntegrationLog.create({
    data: {
      endpoint: input.endpoint,
      httpMethod: input.httpMethod,
      requestPayload: input.requestPayload ? maskPayload(JSON.stringify(input.requestPayload)) : undefined,
      responsePayload: input.responsePayload ? maskPayload(JSON.stringify(input.responsePayload)) : undefined,
      statusCode: input.statusCode,
      responseTimeMs: input.responseTimeMs,
      ipAddress: input.ipAddress,
    },
  });
}

export function verifyHmac(payload: string, signature: string, secret: string) {
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new AppError(401, "API-001", "Signature Invalidation");
  }
}

export async function otaSync() {
  const rooms = await prisma.room.count({ where: { isActive: true } });
  const occupied = await prisma.reservation.count({ where: { status: "CHECKED_IN" } });
  const payload = {
    property: "Manica Skyview Hotel",
    rooms,
    occupied,
    available: rooms - occupied,
    syncedAt: new Date().toISOString(),
  };
  await logIntegration({
    endpoint: "/api/v1/integrations/ota/sync",
    httpMethod: "POST",
    responsePayload: payload,
    statusCode: 200,
    responseTimeMs: 12,
  });
  return payload;
}

export async function processPayment(input: {
  amount: number;
  currency?: string;
  cardNumber?: string;
  reference: string;
}) {
  const masked = input.cardNumber ? maskPayload(input.cardNumber) : undefined;
  const result = {
    accepted: true,
    gateway: "STUB",
    reference: input.reference,
    amount: input.amount,
    currency: input.currency ?? "USD",
    card: masked,
  };
  await logIntegration({
    endpoint: "/api/v1/integrations/payments/process",
    httpMethod: "POST",
    requestPayload: { amount: input.amount, cardNumber: input.cardNumber, password: "secret" },
    responsePayload: result,
    statusCode: 200,
    responseTimeMs: 40,
  });
  return result;
}
