import JSZip from "jszip";

type Cell = { value: unknown; style?: number; numeric?: boolean };

export async function buildReportWorkbook(
  rows: Record<string, unknown>[],
  filters: Record<string, unknown>,
): Promise<Buffer> {
  const generatedAt = new Date();
  const summaryRows: Cell[][] = [
    [text("Indicador", 1), text("Valor", 1)],
    [text("Registros"), number(rows.length)],
    [
      text("Valor total"),
      number(rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0), 2),
    ],
    [text("Generado"), text(generatedAt.toLocaleString("es-BO"))],
    [
      text("Filtros"),
      text(Object.keys(filters).length ? JSON.stringify(filters) : "Sin filtros"),
    ],
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
      number(row.quantity),
      number(row.unit_price, 2),
      number(row.total, 2),
    ]),
  ];

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
    ?.file("sheet1.xml", sheetXml(summaryRows, [28, 42], false))
    .file("sheet2.xml", sheetXml(detailRows, [18, 18, 16, 28, 16, 15, 30, 18, 12, 18, 18], true));

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function sheetXml(rows: Cell[][], widths: number[], filter: boolean): string {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const lastCell = `${columnName(columnCount)}${Math.max(rows.length, 1)}`;
  const cols = widths
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const rowXml = rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map((cell, columnIndex) => cellXml(cell, `${columnName(columnIndex + 1)}${rowIndex + 1}`))
          .join("")}</row>`,
    )
    .join("");
  const tableOptions = filter ? `<autoFilter ref="A1:${columnName(columnCount)}1"/>` : "";
  const frozen = filter
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastCell}"/>
  ${frozen}
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${cols}</cols>
  <sheetData>${rowXml}</sheetData>
  ${tableOptions}
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
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
  </sheets>
</workbook>`;

const workbookRelationshipsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;Bs&quot; #,##0.00"/></numFmts>
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const appPropertiesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>SCM Global</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Hojas</vt:lpstr></vt:variant><vt:variant><vt:i4>2</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="2" baseType="lpstr"><vt:lpstr>Resumen</vt:lpstr><vt:lpstr>Detalle</vt:lpstr></vt:vector></TitlesOfParts>
</Properties>`;

function corePropertiesXml(generatedAt: Date): string {
  const timestamp = generatedAt.toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>SCM Global</dc:creator>
  <cp:lastModifiedBy>SCM Global</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>
</cp:coreProperties>`;
}
