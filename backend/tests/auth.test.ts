import { describe, expect, it, vi } from "vitest";
import { requirePermission } from "../src/shared/auth.js";

describe("control de permisos", () => {
  it("acepta cualquiera de los permisos solicitados", () => {
    const middleware = requirePermission("inventory.read", "reports.read");
    const next = vi.fn();
    middleware(
      {
        user: { permissions: ["reports.read"] },
      } as never,
      {} as never,
      next,
    );
    expect(next).toHaveBeenCalledWith();
  });

  it("rechaza una operación fuera del rol", () => {
    const middleware = requirePermission("users.manage");
    const next = vi.fn();
    middleware(
      {
        user: { permissions: ["tracking.read"] },
      } as never,
      {} as never,
      next,
    );
    const error = next.mock.calls[0]?.[0] as { status: number; message: string };
    expect(error.status).toBe(403);
    expect(error.message).toContain("permiso");
  });
});
