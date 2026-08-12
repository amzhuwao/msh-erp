import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler, notFoundHandler } from "./middleware/http.js";
import { authRouter } from "./routes/auth.routes.js";
import { guestsRouter } from "./routes/guests.routes.js";
import { healthRouter } from "./routes/health.js";
import { propertyRouter } from "./routes/property.routes.js";
import { reservationsRouter } from "./routes/reservations.routes.js";
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
    version: "0.2.0",
    modules: ["Auth", "Reservations", "Rooms", "Property"],
  });
});

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/property", propertyRouter);
app.use("/api/guests", guestsRouter);
app.use("/api/reservations", reservationsRouter);
app.use("/api/rooms", roomsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(port, host, () => {
  console.log(`MSH ERP API listening on http://${host}:${port}`);
});
