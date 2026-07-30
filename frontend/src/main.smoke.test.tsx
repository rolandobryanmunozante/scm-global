// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("arranque del frontend", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    };
    vi.stubGlobal("localStorage", storage);
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
    document.body.innerHTML = '<div id="root"></div>';
    window.history.replaceState({}, "", "/login");
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renderiza el acceso sin errores de inicialización", async () => {
    await import("./main");
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(document.body.textContent, document.body.innerHTML).toContain("Bienvenido");
  }, 15_000);
});
