import { createServer } from "node:http";
import cron from "node-cron";
import { Server } from "socket.io";
import { app } from "./app.js";
import { config } from "./config.js";
import {
  checkLatePurchaseOrders,
  generateAutomaticPurchaseOrders,
} from "./modules/inventarios/inventarios.service.js";
import { checkDatabase } from "./shared/db.js";
import { registerRealtimeServer } from "./shared/realtime.js";

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: config.WEB_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: true,
  },
});
registerRealtimeServer(io);

io.on("connection", (socket) => {
  const rooms = socket.handshake.auth.rooms;
  if (Array.isArray(rooms)) {
    for (const room of rooms.slice(0, 20)) {
      if (typeof room === "string" && /^(?:[a-z]+:\d+|inventory|shipments)$/.test(room)) {
        void socket.join(room);
      }
    }
  }
});

cron.schedule(
  "0 0 * * *",
  () => {
    void generateAutomaticPurchaseOrders().catch((error) =>
      console.error("Automatic replenishment failed", error),
    );
  },
  { timezone: "America/La_Paz" },
);

cron.schedule(
  "15 * * * *",
  () => {
    void checkLatePurchaseOrders().catch((error) =>
      console.error("Late purchase order check failed", error),
    );
  },
  { timezone: "America/La_Paz" },
);

httpServer.listen(config.PORT, "0.0.0.0", async () => {
  const database = await checkDatabase();
  console.info(`SCM API listening on http://localhost:${config.PORT}`);
  console.info(`PostgreSQL: ${database ? "connected" : "unavailable"}`);
});
