import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import helmet from "helmet";
import configuracionRoutes from "./modules/configuracion/configuracion.routes.js";
import demoRoutes from "./modules/demo/demo.routes.js";
import inventariosRoutes from "./modules/inventarios/inventarios.routes.js";
import logisticaRoutes from "./modules/logistica/logistica.routes.js";
import proveedoresRoutes from "./modules/proveedores/proveedores.routes.js";
import reportesRoutes from "./modules/reportes/reportes.routes.js";
import seguridadRoutes from "./modules/seguridad/seguridad.routes.js";
import transporteRoutes from "./modules/transporte/transporte.routes.js";
import { config } from "./config.js";
import { checkDatabase } from "./shared/db.js";
import { errorHandler } from "./shared/errors.js";

export const app = express();
const frontendDistPath =
  process.env.FRONTEND_DIST_PATH ??
  join(dirname(fileURLToPath(import.meta.url)), "../../../frontend/dist");
const frontendIndexPath = join(frontendDistPath, "index.html");

app.set("trust proxy", "loopback, linklocal, uniquelocal");
app.disable("x-powered-by");
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://*.tile.openstreetmap.org",
        ],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        upgradeInsecureRequests: null,
      },
    },
  }),
);
app.use(
  cors({
    origin: config.WEB_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.get("/api/health", async (_request, response) => {
  const database = await checkDatabase();
  response.status(database ? 200 : 503).json({
    status: database ? "ok" : "degraded",
    database,
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/seguridad", seguridadRoutes);
app.use("/api/proveedores", proveedoresRoutes);
app.use("/api/inventarios", inventariosRoutes);
app.use("/api/logistica", logisticaRoutes);
app.use("/api/transporte", transporteRoutes);
app.use("/api/reportes", reportesRoutes);
app.use("/api/configuracion", configuracionRoutes);
app.use("/api/demo", demoRoutes);

if (existsSync(frontendIndexPath)) {
  app.use(
    express.static(frontendDistPath, {
      index: false,
      maxAge: config.NODE_ENV === "production" ? "7d" : 0,
      immutable: config.NODE_ENV === "production",
    }),
  );
  app.use((request, response, next) => {
    if (request.method === "GET" && !request.path.startsWith("/api/")) {
      response.sendFile(frontendIndexPath);
      return;
    }
    next();
  });
}

app.use((_request, response) => {
  response.status(404).json({ message: "Ruta no encontrada" });
});

app.use(errorHandler);
