import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

vi.mock("../src/shared/db.js", () => ({
  checkDatabase: vi.fn().mockResolvedValue(true),
  pool: { query: vi.fn(), connect: vi.fn() },
}));

describe("API base", () => {
  it("expone un estado de salud", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok", database: true });
  }, 15_000);

  it("responde 404 para rutas desconocidas", async () => {
    const response = await request(app).get("/api/no-existe");
    expect(response.status).toBe(404);
  });
});
