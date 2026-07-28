import cors from "cors";
import express from "express";
import helmet from "helmet";
import configuracionRoutes from "./modules/configuracion/configuracion.routes.js";
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

app.set("trust proxy", "loopback, linklocal, uniquelocal");
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
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

app.use((_request, response) => {
  response.status(404).json({ message: "Ruta no encontrada" });
});

app.use(errorHandler);
