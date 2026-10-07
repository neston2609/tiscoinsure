import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { genesysAdminRouter } from "./routes/genesys-admin.routes";
import { genesysRegionService } from "./services/genesys/genesys-region.service";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "tiscoinsure", time: new Date().toISOString() });
});

app.use("/api/admin/genesys", genesysAdminRouter);

if (process.env.NODE_ENV === "production") {
  const clientDir = path.resolve(__dirname, "..", "dist", "client");
  app.use(express.static(clientDir));
  app.use((_request, response) => {
    response.sendFile(path.join(clientDir, "index.html"));
  });
}

app.use((error: Error & { status?: number }, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(error.status ?? 500).json({
    message: error.message || "Unexpected server error"
  });
});

await genesysRegionService.initialize();

app.listen(port, "0.0.0.0", () => {
  console.log(`TISCO Insure listening on ${port}`);
});
