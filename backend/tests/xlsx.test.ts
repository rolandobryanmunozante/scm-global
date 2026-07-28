import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildReportWorkbook } from "../src/shared/xlsx.js";

describe("exportación XLSX", () => {
  it("genera un libro válido con resumen, detalle y texto escapado", async () => {
    const buffer = await buildReportWorkbook(
      [
        {
          code: "OC-1",
          created_at: "2026-07-27T12:00:00Z",
          status: "APROBADA",
          supplier: "Proveedor & Asociados",
          country: "Bolivia",
          sku: "SKU-1",
          product: "Producto <seguro>",
          category: "Prueba",
          quantity: 2,
          unit_price: 10.5,
          total: 21,
        },
      ],
      { country: "Bolivia" },
    );

    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    const zip = await JSZip.loadAsync(buffer);
    expect(Object.keys(zip.files)).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "xl/workbook.xml",
        "xl/styles.xml",
        "xl/worksheets/sheet1.xml",
        "xl/worksheets/sheet2.xml",
      ]),
    );
    const workbook = await zip.file("xl/workbook.xml")!.async("string");
    const detail = await zip.file("xl/worksheets/sheet2.xml")!.async("string");
    expect(workbook).toContain('name="Resumen"');
    expect(workbook).toContain('name="Detalle"');
    expect(detail).toContain("Proveedor &amp; Asociados");
    expect(detail).toContain("Producto &lt;seguro&gt;");
    expect(detail).toContain("<v>21</v>");
  });
});
