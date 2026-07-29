import JSZip from "jszip";

type Cell = { value: unknown; style?: number; numeric?: boolean };

interface SheetOptions {
  headerRow?: number;
  freezeRows?: number;
  filterLastRow?: number;
  merges?: string[];
  landscape?: boolean;
  rowHeights?: Record<number, number>;
}

export async function buildReportWorkbook(
  rows: Record<string, unknown>[],
  filters: Record<string, unknown>,
): Promise<Buffer> {
  const generatedAt = new Date();
  const totalValue = rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  const totalUnits = rows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
  const uniqueOrders = new Set(rows.map((row) => String(row.code ?? ""))).size;
  const uniqueSuppliers = new Set(rows.map((row) => String(row.supplier ?? ""))).size;
  const activeFilters = describeFilters(filters);

  const summaryRows: Cell[][] = [
    [text("SCM Global · Reporte consolidado", 3)],
    [text("Resumen ejecutivo de órdenes de compra", 4)],
    [text(`Generado: ${generatedAt.toLocaleString("es-BO")}`, 4)],
    [],
    [text("Indicador", 1), text("Valor", 1)],
    [text("Registros exportados", 5), number(rows.length, 6)],
    [text("Órdenes únicas", 5), number(uniqueOrders, 6)],
    [text("Proveedores", 5), number(uniqueSuppliers, 6)],
    [text("Unidades", 5), number(totalUnits, 6)],
    [text("Valor total", 5), number(totalValue, 9)],
    [],
    [text("Filtros aplicados", 7)],
    ...activeFilters.map(([label, value]) => [text(label, 5), text(value)]),
  ];

  const headers = [
    "Orden",
    "Fecha",
    "Estado",
    "Proveedor",
    "País",
    "SKU",
    "Producto",
    "Categoría",
    "Cantidad",
    "Precio unitario",
    "Total",
  ];
  const detailRows: Cell[][] = [
    [text("SCM Global · Detalle de compras", 3)],
    [text("Datos listos para filtrar, ordenar y analizar", 4)],
    [text(`Generado: ${generatedAt.toLocaleString("es-BO")}`, 4)],
    [],
    headers.map((header) => text(header, 1)),
    ...rows.map((row) => [
      text(row.code),
      text(toDate(row.created_at)),
      text(row.status),
      text(row.supplier),
      text(row.country),
      text(row.sku),
      text(row.product),
      text(row.category),
      number(row.quantity, 6),
      number(row.unit_price, 2),
      number(row.total, 2),
    ]),
    [
      text("TOTAL GENERAL", 8),
      text("", 8),
      text("", 8),
      text("", 8),
      text("", 8),
      text("", 8),
      text("", 8),
      text("", 8),
      number(totalUnits, 8),
      text("", 8),
      number(totalValue, 9),
    ],
  ];

  const supplierRows = buildSupplierRows(rows, totalUnits, totalValue, generatedAt);

  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypesXml);
  zip.folder("_rels")?.file(".rels", rootRelationshipsXml);
  zip.folder("docProps")?.file("app.xml", appPropertiesXml);
  zip.folder("docProps")?.file("core.xml", corePropertiesXml(generatedAt));

  const workbook = zip.folder("xl");
  workbook?.file("workbook.xml", workbookXml);
  workbook?.folder("_rels")?.file("workbook.xml.rels", workbookRelationshipsXml);
  workbook?.file("styles.xml", stylesXml);
  workbook
    ?.folder("worksheets")
    ?.file(
      "sheet1.xml",
      sheetXml(summaryRows, [30, 48], {
        merges: ["A1:D1", "A2:D2", "A3:D3", "A12:D12"],
        rowHeights: { 1: 30, 2: 22, 12: 22 },
      }),
    )
    .file(
      "sheet2.xml",
      sheetXml(detailRows, [18, 14, 16, 30, 16, 15, 32, 20, 12, 18, 18], {
        headerRow: 5,
        freezeRows: 5,
        filterLastRow: rows.length + 5,
        merges: ["A1:K1", "A2:K2", "A3:K3"],
        landscape: true,
        rowHeights: { 1: 30, 2: 22, 5: 22 },
      }),
    )
    .file(
      "sheet3.xml",
      sheetXml(supplierRows, [34, 18, 14, 16, 14, 20], {
        headerRow: 5,
        freezeRows: 5,
        filterLastRow: Math.max(5, supplierRows.length - 1),
        merges: ["A1:F1", "A2:F2", "A3:F3"],
        rowHeights: { 1: 30, 2: 22, 5: 22 },
      }),
    );

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function buildSupplierRows(
  rows: Record<string, unknown>[],
  totalUnits: number,
  totalValue: number,
  generatedAt: Date,
): Cell[][] {
  const grouped = new Map<
    string,
    {
      supplier: string;
      country: string;
      orders: Set<string>;
      products: Set<string>;
      units: number;
      total: number;
    }
  >();

  for (const row of rows) {
    const supplier = String(row.supplier ?? "Sin proveedor");
    const current = grouped.get(supplier) ?? {
      supplier,
      country: String(row.country ?? ""),
      orders: new Set<string>(),
      products: new Set<string>(),
      units: 0,
      total: 0,
    };
    current.orders.add(String(row.code ?? ""));
    current.products.add(String(row.sku ?? ""));
    current.units += Number(row.quantity ?? 0);
    current.total += Number(row.total ?? 0);
    grouped.set(supplier, current);
  }

  const values = [...grouped.values()].sort((a, b) => b.total - a.total);
  return [
    [text("SCM Global · Resumen por proveedor", 3)],
    [text("Concentración de compras y volumen por socio comercial", 4)],
    [text(`Generado: ${generatedAt.toLocaleString("es-BO")}`, 4)],
    [],
    ["Proveedor", "País", "Órdenes", "Productos", "Unidades", "Valor total"].map((value) =>
      text(value, 1),
    ),
    ...values.map((value) => [
      text(value.supplier),
      text(value.country),
      number(value.orders.size, 6),
      number(value.products.size, 6),
      number(value.units, 6),
      number(value.total, 2),
    ]),
    [
      text("TOTAL GENERAL", 8),
      text("", 8),
      text("", 8),
      text("", 8),
      number(totalUnits, 8),
      number(totalValue, 9),
    ],
  ];
}

function describeFilters(filters: Record<string, unknown>): Array<[string, string]> {
  const labels: Record<string, string> = {
    from: "Fecha desde",
    to: "Fecha hasta",
    country: "País",
    categoryId: "Categoría ID",
    supplierId: "Proveedor ID",
  };
  const entries = Object.entries(filters).filter(([, value]) => value !== undefined && value !== "");
  if (!entries.length) return [["Alcance", "Sin filtros · todos los datos disponibles"]];
  return entries.map(([key, value]) => [labels[key] ?? key, String(value)]);
}

function sheetXml(rows: Cell[][], widths: number[], options: SheetOptions = {}): string {
  const columnCount = Math.max(widths.length, 1, ...rows.map((row) => row.length));
  const lastCell = `${columnName(columnCount)}${Math.max(rows.length, 1)}`;
  const cols = widths
    .map(
      (width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
    )
    .join("");
  const rowXml = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const height = options.rowHeights?.[rowNumber];
      const heightAttributes = height ? ` ht="${height}" customHeight="1"` : "";
      return `<row r="${rowNumber}"${heightAttributes}>${row
        .map((cell, columnIndex) =>
          cellXml(cell, `${columnName(columnIndex + 1)}${rowNumber}`),
        )
        .join("")}</row>`;
    })
    .join("");
  const tableOptions =
    options.headerRow && options.filterLastRow
      ? `<autoFilter ref="A${options.headerRow}:${columnName(columnCount)}${options.filterLastRow}"/>`
      : "";
  const frozen = options.freezeRows
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${options.freezeRows}" topLeftCell="A${options.freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const merges = options.merges?.length
    ? `<mergeCells count="${options.merges.length}">${options.merges
        .map((reference) => `<mergeCell ref="${reference}"/>`)
        .join("")}</mergeCells>`
    : "";
  const pageSetup = options.landscape
    ? '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>'
    : '<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:${lastCell}"/>
  ${frozen}
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${cols}</cols>
  <sheetData>${rowXml}</sheetData>
  ${tableOptions}
  ${merges}
  <pageMargins left="0.35" right="0.35" top="0.55" bottom="0.55" header="0.2" footer="0.2"/>
  ${pageSetup}
</worksheet>`;
}

function cellXml(cell: Cell, reference: string): string {
  const style = cell.style ? ` s="${cell.style}"` : "";
  if (cell.numeric) {
    const value = Number(cell.value);
    return `<c r="${reference}"${style}><v>${Number.isFinite(value) ? value : 0}</v></c>`;
  }
  return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(
    String(cell.value ?? ""),
  )}</t></is></c>`;
}

function text(value: unknown, style = 0): Cell {
  return { value, style };
}

function number(value: unknown, style = 0): Cell {
  return { value, style, numeric: true };
}

function toDate(value: unknown): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
}

function columnName(index: number): string {
  let result = "";
  for (let value = index; value > 0; value = Math.floor((value - 1) / 26)) {
    result = String.fromCharCode(((value - 1) % 26) + 65) + result;
  }
  return result;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const rootRelationshipsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView/></bookViews>
  <sheets>
    <sheet name="Resumen" sheetId="1" r:id="rId1"/>
    <sheet name="Detalle" sheetId="2" r:id="rId2"/>
    <sheet name="Por proveedor" sheetId="3" r:id="rId3"/>
  </sheets>
</workbook>`;

const workbookRelationshipsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="&quot;Bs&quot; #,##0.00"/>
    <numFmt numFmtId="165" formatCode="#,##0"/>
  </numFmts>
  <fonts count="5">
    <font><sz val="11"/><name val="Calibri"/><family val="2"/><color rgb="FF001D39"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="20"/><name val="Calibri"/><family val="2"/></font>
    <font><color rgb="FF49769F"/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><color rgb="FF001D39"/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="7">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0A4174"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF001D39"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFBDD8E9"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF4E8EA2"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF7BBDE8"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFBDD8E9"/></left>
      <right style="thin"><color rgb="FFBDD8E9"/></right>
      <top style="thin"><color rgb="FFBDD8E9"/></top>
      <bottom style="thin"><color rgb="FFBDD8E9"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="10">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const appPropertiesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>SCM Global</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Hojas</vt:lpstr></vt:variant><vt:variant><vt:i4>3</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="3" baseType="lpstr"><vt:lpstr>Resumen</vt:lpstr><vt:lpstr>Detalle</vt:lpstr><vt:lpstr>Por proveedor</vt:lpstr></vt:vector></TitlesOfParts>
</Properties>`;

function corePropertiesXml(generatedAt: Date): string {
  const timestamp = generatedAt.toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>SCM Global</dc:creator>
  <dc:title>Reporte consolidado SCM Global</dc:title>
  <dc:subject>Órdenes de compra, proveedores y productos</dc:subject>
  <cp:lastModifiedBy>SCM Global</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>
</cp:coreProperties>`;
}
