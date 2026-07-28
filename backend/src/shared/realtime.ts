import type { Server } from "socket.io";

let io: Server | undefined;

export function registerRealtimeServer(server: Server): void {
  io = server;
}

export function emitEvent(room: string, event: string, payload: unknown): void {
  io?.to(room).emit(event, payload);
}

export function emitShipmentEvent(
  shipmentId: number,
  event: string,
  payload: unknown,
): void {
  emitEvent(`shipment:${shipmentId}`, event, payload);
  emitEvent("shipments", event, payload);
}
