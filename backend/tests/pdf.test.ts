import { describe, expect, it } from "vitest";
import { buildPdfReport } from "../src/modules/reportes/reportes.routes.js";

describe("exportación PDF", () => {
  it("no crea una página fantasma al añadir el pie", async () => {
    const buffer = await buildPdfReport(
      [
        {
          code: "OC-001",
          created_at: "2026-07-27T12:00:00Z",
          status: "APROBADA",
          supplier: "Proveedor de demostración",
          country: "Bolivia",
          product: "Producto correlacionado",
          quantity: 2,
          total: 21,
        },
      ],
      {},
    );

    const source = buffer.toString("latin1");
    expect(source.match(/\/Type \/Page\b/g)?.length ?? 0).toBe(1);
  });

  it("genera un PDF ejecutivo paginado con los colores de marca", async () => {
    const rows = Array.from({ length: 35 }, (_, index) => ({
      code: `OC-${String(index + 1).padStart(3, "0")}`,
      created_at: "2026-07-27T12:00:00Z",
      status: index % 2 ? "APROBADA" : "ENVIADA",
      supplier: "Proveedor de demostración",
      country: "Bolivia",
      sku: `SKU-${index + 1}`,
      product: `Producto correlacionado ${index + 1}`,
      category: "Demostración",
      quantity: index + 1,
      unit_price: 10.5,
      total: (index + 1) * 10.5,
    }));

    const buffer = await buildPdfReport(rows, { country: "Bolivia" });
    const source = buffer.toString("latin1");

    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(3_000);
    expect(source.match(/\/Type \/Page\b/g)?.length ?? 0).toBeGreaterThan(1);
    expect(source).toContain("Reporte consolidado SCM Global");
  });
});
