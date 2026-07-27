import { describe, expect, it, vi } from "vitest";

vi.mock("../src/shared/db.js", () => ({
  checkDatabase: vi.fn().mockResolvedValue(true),
  pool: { query: vi.fn(), connect: vi.fn() },
}));

describe("API base", () => {
  it("expone un estado de salud", async () => {
    const request = (await import("supertest")).default;
    const { app } = await import("../src/app.js");
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok", database: true });
  }, 15_000);

  it("responde 404 para rutas desconocidas", async () => {
    const request = (await import("supertest")).default;
    const { app } = await import("../src/app.js");
    const response = await request(app).get("/api/no-existe");
    expect(response.status).toBe(404);
  });
});
