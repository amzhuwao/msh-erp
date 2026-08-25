import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler, notFoundHandler } from "./middleware/http.js";
import { accountsRouter } from "./routes/accounts.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { conferenceRouter } from "./routes/conference.routes.js";
import { corporateRouter } from "./routes/corporate.routes.js";
import { crmRouter } from "./routes/crm.routes.js";
import { financeRouter } from "./routes/finance.routes.js";
import { foliosRouter } from "./routes/folios.routes.js";
import { frontOfficeRouter } from "./routes/front-office.routes.js";
import { groupReservationsRouter } from "./routes/group-reservations.routes.js";
import { guestServicesRouter } from "./routes/guest-services.routes.js";
import { guestsRouter } from "./routes/guests.routes.js";
import { guestRouter } from "./routes/guest.routes.js";
import { healthRouter } from "./routes/health.js";
import { housekeepingRouter } from "./routes/housekeeping.routes.js";
import { integrationsRouter } from "./routes/integrations.routes.js";
import { inventoryRouter } from "./routes/inventory.routes.js";
import { maintenanceRouter } from "./routes/maintenance.routes.js";
import { nightAuditRouter } from "./routes/night-audit.routes.js";
import { notificationsRouter } from "./routes/notifications.routes.js";
import { posRouter } from "./routes/pos.routes.js";
import { procurementRouter } from "./routes/procurement.routes.js";
import { propertyRouter } from "./routes/property.routes.js";
import { publicRouter } from "./routes/public.routes.js";
import { reportsRouter } from "./routes/reports.routes.js";
import { reservationsRouter } from "./routes/reservations.routes.js";
import { revenueRouter } from "./routes/revenue.routes.js";
import { roomsRouter } from "./routes/rooms.routes.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    name: "Manica Skyview Hotel ERP",
    property: "Manica Skyview Hotel",
    version: "0.8.0",
    modules: [
      "Auth", "Reservations", "GroupReservations", "Housekeeping", "POS", "Conference",
      "Inventory", "Procurement", "Finance", "Maintenance", "CRM", "Corporate",
      "Revenue", "GuestServices", "Reporting", "Notifications", "Integrations", "Accounts",
    ],
  });
});

app.use("/api/health", healthRouter);
app.use("/api/public", publicRouter);
app.use("/api/guest", guestRouter);
app.use("/api/auth", authRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/property", propertyRouter);
app.use("/api/guests", guestsRouter);
app.use("/api/reservations", reservationsRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/group-reservations", groupReservationsRouter);
app.use("/api/corporate", corporateRouter);
app.use("/api/front-office", frontOfficeRouter);
app.use("/api/folios", foliosRouter);
app.use("/api/housekeeping", housekeepingRouter);
app.use("/api/night-audit", nightAuditRouter);
app.use("/api/pos", posRouter);
app.use("/api/finance", financeRouter);
app.use("/api/conference", conferenceRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/procurement", procurementRouter);
app.use("/api/maintenance", maintenanceRouter);
app.use("/api/crm", crmRouter);
app.use("/api/revenue", revenueRouter);
app.use("/api/services", guestServicesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/v1/integrations", integrationsRouter);
app.use("/api/integrations", integrationsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(port, host, () => {
  console.log(`MSH ERP API listening on http://${host}:${port}`);
});
