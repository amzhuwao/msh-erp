import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { healthRouter } from "./routes/health.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use("/api/health", healthRouter);

app.get("/", (_req, res) => {
  res.json({
    name: "MSH ERP API",
    version: "0.1.0",
    docs: "/api/health",
  });
});

app.listen(port, host, () => {
  console.log(`MSH ERP API listening on http://${host}:${port}`);
});
