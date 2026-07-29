import { Router } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { asyncHandler } from "../../shared/async-handler.js";
import { authenticate, requirePermission } from "../../shared/auth.js";
import { pool } from "../../shared/db.js";
import { AppError } from "../../shared/errors.js";
import { buildReportWorkbook } from "../../shared/xlsx.js";

const router = Router();
router.use(authenticate);

const filtersSchema = z
  .object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    country: z.string().trim().max(80).optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    supplierId: z.coerce.number().int().positive().optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "La fecha inicial no puede ser posterior a la final",
    path: ["from"],
  });

const exportFiltersSchema = filtersSchema.refine((value) => value.from && value.to, {
  message: "Debe seleccionar una fecha inicial y una fecha final para exportar",
  path: ["from"],
});

router.get(
  "/filtros",
  requirePermission("reports.read"),
  asyncHandler(async (_request, response) => {
    const [suppliers, products, countries] = await Promise.all([
      pool.query(
        `SELECT id,code,commercial_name,country
         FROM suppliers
         WHERE active
         ORDER BY commercial_name`,
      ),
      pool.query(
        `SELECT p.id,p.sku,p.name,c.name AS category
         FROM products p
         JOIN categories c ON c.id=p.category_id
         WHERE p.active
         ORDER BY p.name`,
      ),
      pool.query(
        `SELECT DISTINCT country
         FROM suppliers
         WHERE active
         ORDER BY country`,
      ),
    ]);
    response.json({
      suppliers: suppliers.rows,
      products: products.rows,
      countries: countries.rows.map((row) => row.country),
    });
  }),
);

router.get(
  "/dashboard",
  requirePermission("reports.read"),
  asyncHandler(async (request, response) => {
    const filters = filtersSchema.parse(request.query);
    const [sales, inventory, shipments, orders, topSupplier, salesByCountry, monthly, stockByCategory] =
      await Promise.all([
        pool.query(
          `SELECT COALESCE(SUM(amount),0)::FLOAT AS value
           FROM monthly_sales
           WHERE month >= COALESCE($1::DATE,DATE_TRUNC('month',CURRENT_DATE))
             AND month <= COALESCE($2::DATE,CURRENT_DATE)
             AND ($3::TEXT IS NULL OR country=$3)
             AND ($4::BIGINT IS NULL OR category_id=$4)`,
          [
            filters.from ?? null,
            filters.to ?? null,
            filters.country ?? null,
            filters.categoryId ?? null,
          ],
        ),
        pool.query(
          `SELECT COALESCE(SUM(s.current_quantity*p.unit_price),0)::FLOAT AS value
           FROM stocks s JOIN products p ON p.id=s.product_id
           WHERE ($1::BIGINT IS NULL OR p.category_id=$1)`,
          [filters.categoryId ?? null],
        ),
        pool.query(
          `SELECT COUNT(*) FILTER (WHERE status IN ('EN_TRANSITO','EN_ADUANA','INCIDENCIA','RETRASADO'))::INTEGER AS active,
                  COUNT(*) FILTER (WHERE status='RETRASADO' OR (eta_at<NOW() AND status<>'ENTREGADO'))::INTEGER AS delayed
           FROM shipments
           WHERE ($1::DATE IS NULL OR created_at::DATE >= $1)
             AND ($2::DATE IS NULL OR created_at::DATE <= $2)`,
          [filters.from ?? null, filters.to ?? null],
        ),
        pool.query(
          `SELECT COUNT(*)::INTEGER AS pending FROM purchase_orders
           WHERE status IN ('BORRADOR','APROBADA','ENVIADA','CONFIRMADA')
             AND ($1::DATE IS NULL OR created_at::DATE >= $1)
             AND ($2::DATE IS NULL OR created_at::DATE <= $2)`,
          [filters.from ?? null, filters.to ?? null],
        ),
        pool.query(
          `SELECT s.commercial_name,ss.score::FLOAT AS score
           FROM suppliers s JOIN supplier_scores ss ON ss.supplier_id=s.id
           WHERE s.active ORDER BY ss.score DESC LIMIT 1`,
        ),
        pool.query(
          `SELECT country,SUM(amount)::FLOAT AS value
           FROM monthly_sales
           WHERE ($1::DATE IS NULL OR month >= $1) AND ($2::DATE IS NULL OR month <= $2)
             AND ($3::TEXT IS NULL OR country=$3) AND ($4::BIGINT IS NULL OR category_id=$4)
           GROUP BY country ORDER BY value DESC`,
          [filters.from ?? null, filters.to ?? null, filters.country ?? null, filters.categoryId ?? null],
        ),
        pool.query(
          `SELECT TO_CHAR(month,'YYYY-MM') AS month,SUM(amount)::FLOAT AS value
           FROM monthly_sales
           WHERE ($1::DATE IS NULL OR month >= $1) AND ($2::DATE IS NULL OR month <= $2)
             AND ($3::TEXT IS NULL OR country=$3) AND ($4::BIGINT IS NULL OR category_id=$4)
           GROUP BY month ORDER BY month`,
          [filters.from ?? null, filters.to ?? null, filters.country ?? null, filters.categoryId ?? null],
        ),
        pool.query(
          `SELECT c.name AS category,SUM(s.current_quantity)::INTEGER AS value
           FROM stocks s JOIN products p ON p.id=s.product_id JOIN categories c ON c.id=p.category_id
           WHERE ($1::BIGINT IS NULL OR c.id=$1)
           GROUP BY c.id,c.name ORDER BY value DESC`,
          [filters.categoryId ?? null],
        ),
      ]);

    response.json({
      kpis: {
        monthlySales: sales.rows[0].value,
        inventoryValue: inventory.rows[0].value,
        activeShipments: shipments.rows[0].active,
        delayedShipments: shipments.rows[0].delayed,
        pendingOrders: orders.rows[0].pending,
        topSupplier: topSupplier.rows[0] ?? { commercial_name: "Sin calificaciones", score: 0 },
      },
      charts: {
        salesByCountry: salesByCountry.rows,
        monthlyEvolution: monthly.rows,
        stockByCategory: stockByCategory.rows,
      },
      refreshedAt: new Date().toISOString(),
    });
  }),
);

router.get(
  "/trazabilidad/:productId",
  requirePermission("reports.read"),
  asyncHandler(async (request, response) => {
    const productId = z.coerce.number().int().positive().parse(request.params.productId);
    const productResult = await pool.query(
      `SELECT p.*,c.name AS category FROM products p JOIN categories c ON c.id=p.category_id WHERE p.id=$1`,
      [productId],
    );
    if (!productResult.rowCount) throw new AppError(404, "Producto no encontrado");
    const [orders, movements, shipments] = await Promise.all([
      pool.query(
        `SELECT po.id,po.code,po.status,po.created_at,po.expected_delivery_date,
                s.commercial_name AS supplier,i.quantity
         FROM purchase_order_items i
         JOIN purchase_orders po ON po.id=i.purchase_order_id
         JOIN suppliers s ON s.id=po.supplier_id
         WHERE i.product_id=$1 ORDER BY po.created_at`,
        [productId],
      ),
      pool.query(
        `SELECT m.id,m.movement_type,m.reason,m.quantity,m.previous_quantity,m.resulting_quantity,
                m.created_at,w.name AS warehouse,u.full_name AS user_name
         FROM inventory_movements m
         JOIN warehouses w ON w.id=m.warehouse_id JOIN users u ON u.id=m.user_id
         WHERE m.product_id=$1 ORDER BY m.created_at`,
        [productId],
      ),
      pool.query(
        `SELECT s.id,s.tracking_code,s.origin,s.destination,s.status,s.departure_at,s.eta_at,s.delivered_at,
                si.quantity,
                COALESCE(json_agg(json_build_object(
                  'type',e.event_type,'status',e.status,'description',e.description,
                  'date',e.created_at,'latitude',e.latitude,'longitude',e.longitude
                ) ORDER BY e.created_at) FILTER (WHERE e.id IS NOT NULL),'[]') AS events
         FROM shipment_items si
         JOIN shipments s ON s.id=si.shipment_id
         LEFT JOIN shipment_events e ON e.shipment_id=s.id
         WHERE si.product_id=$1
         GROUP BY s.id,si.quantity ORDER BY s.created_at`,
        [productId],
      ),
    ]);
    response.json({
      product: productResult.rows[0],
      orders: orders.rows,
      movements: movements.rows,
      shipments: shipments.rows,
    });
  }),
);

router.get(
  "/auditoria",
  requirePermission("audit.read"),
  asyncHandler(async (request, response) => {
    const limit = z.coerce.number().int().min(1).max(500).default(100).parse(request.query.limit);
    const result = await pool.query(
      `SELECT a.*,u.full_name AS user_name,u.email AS user_email
       FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
       ORDER BY a.created_at DESC LIMIT $1`,
      [limit],
    );
    response.json(result.rows);
  }),
);

router.get(
  "/exportar",
  requirePermission("reports.export"),
  asyncHandler(async (request, response) => {
    const format = z.enum(["pdf", "xlsx"]).parse(request.query.format);
    const filters = exportFiltersSchema.parse(request.query);
    const report = await loadReportData(filters);
    if (format === "xlsx") {
      const buffer = await buildReportWorkbook(report, filters);
      const filename = `reporte-scm-${new Date().toISOString().slice(0, 10)}.xlsx`;
      response
        .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .setHeader("Content-Disposition", `attachment; filename="${filename}"`)
        .send(buffer);
      return;
    }
    const buffer = await buildPdfReport(report, filters);
    const filename = `reporte-scm-${new Date().toISOString().slice(0, 10)}.pdf`;
    response
      .type("application/pdf")
      .setHeader("Content-Disposition", `attachment; filename="${filename}"`)
      .send(buffer);
  }),
);

type Filters = z.infer<typeof filtersSchema>;

async function loadReportData(filters: Filters) {
  const result = await pool.query(
    `SELECT po.code,po.status,po.automatic,po.created_at,po.expected_delivery_date,
            s.commercial_name AS supplier,s.country,p.sku,p.name AS product,c.name AS category,
            i.quantity,i.unit_price,(i.quantity*i.unit_price)::NUMERIC(16,2) AS total
     FROM purchase_orders po
     JOIN suppliers s ON s.id=po.supplier_id
     JOIN purchase_order_items i ON i.purchase_order_id=po.id
     JOIN products p ON p.id=i.product_id
     JOIN categories c ON c.id=p.category_id
     WHERE ($1::DATE IS NULL OR po.created_at::DATE >= $1)
       AND ($2::DATE IS NULL OR po.created_at::DATE <= $2)
       AND ($3::TEXT IS NULL OR s.country=$3)
       AND ($4::BIGINT IS NULL OR p.category_id=$4)
       AND ($5::BIGINT IS NULL OR s.id=$5)
     ORDER BY po.created_at DESC LIMIT 10000`,
    [
      filters.from ?? null,
      filters.to ?? null,
      filters.country ?? null,
      filters.categoryId ?? null,
      filters.supplierId ?? null,
    ],
  );
  return result.rows;
}

export async function buildPdfReport(
  rows: Record<string, unknown>[],
  filters: Filters,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 34,
      bufferPages: true,
      info: {
        Title: "Reporte consolidado SCM Global",
        Author: "SCM Global",
        Subject: "Órdenes de compra, proveedores y productos",
      },
    });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    const totalValue = rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
    const totalUnits = rows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
    const uniqueOrders = new Set(rows.map((row) => String(row.code ?? ""))).size;
    const uniqueSuppliers = new Set(rows.map((row) => String(row.supplier ?? ""))).size;
    const generatedAt = new Date();
    const contentWidth = document.page.width - 68;

    drawPdfBrandHeader(document, "Reporte consolidado de órdenes de compra");
    document
      .fillColor("#49769F")
      .fontSize(8)
      .text(
        `Generado: ${generatedAt.toLocaleString("es-BO")}  ·  ${describePdfFilters(filters)}`,
        34,
        91,
        { width: contentWidth },
      );

    const cardY = 112;
    const cardGap = 10;
    const cardWidth = (contentWidth - cardGap * 3) / 4;
    const summaryCards = [
      ["Registros", rows.length.toLocaleString("es-BO")],
      ["Órdenes únicas", uniqueOrders.toLocaleString("es-BO")],
      ["Proveedores", uniqueSuppliers.toLocaleString("es-BO")],
      ["Valor total", money(totalValue)],
    ];
    summaryCards.forEach(([label, value], index) => {
      const x = 34 + index * (cardWidth + cardGap);
      document.roundedRect(x, cardY, cardWidth, 48, 7).fill("#EAF3F8");
      document
        .fillColor("#49769F")
        .fontSize(7)
        .text(label!.toUpperCase(), x + 11, cardY + 9, { width: cardWidth - 22 });
      document
        .fillColor("#001D39")
        .font("Helvetica-Bold")
        .fontSize(15)
        .text(value!, x + 11, cardY + 23, { width: cardWidth - 22 });
      document.font("Helvetica");
    });

    const columns: PdfColumn[] = [
      { label: "Orden", key: "code", width: 72 },
      { label: "Fecha", key: "created_at", width: 62 },
      { label: "Estado", key: "status", width: 76 },
      { label: "Proveedor", key: "supplier", width: 132 },
      { label: "Producto", key: "product", width: 225 },
      { label: "País", key: "country", width: 64 },
      { label: "Cant.", key: "quantity", width: 56, align: "right" },
      { label: "Total", key: "total", width: 86, align: "right" },
    ];
    let tableY = 177;
    drawPdfTableHeader(document, tableY, columns);
    tableY += 24;

    rows.forEach((row, rowIndex) => {
      if (tableY + 29 > document.page.height - 36) {
        document.addPage();
        drawPdfBrandHeader(document, "Detalle de órdenes · continuación", true);
        tableY = 82;
        drawPdfTableHeader(document, tableY, columns);
        tableY += 24;
      }
      if (rowIndex % 2 === 1) {
        document.rect(34, tableY, contentWidth, 28).fill("#F4F8FB");
      }
      let x = 34;
      for (const column of columns) {
        let value = row[column.key];
        if (column.key === "created_at") value = shortDate(value);
        if (column.key === "status") value = String(value ?? "").replaceAll("_", " ");
        if (column.key === "quantity") value = Number(value ?? 0).toLocaleString("es-BO");
        if (column.key === "total") value = money(Number(value ?? 0));
        document
          .fillColor("#001D39")
          .fontSize(7.4)
          .text(String(value ?? "—"), x + 6, tableY + 9, {
            width: column.width - 12,
            height: 12,
            ellipsis: true,
            lineBreak: false,
            align: column.align ?? "left",
          });
        x += column.width;
      }
      document
        .moveTo(34, tableY + 28)
        .lineTo(34 + contentWidth, tableY + 28)
        .lineWidth(0.35)
        .strokeColor("#BDD8E9")
        .stroke();
      tableY += 28;
    });

    if (!rows.length) {
      document
        .fillColor("#49769F")
        .fontSize(10)
        .text("No existen registros para los filtros seleccionados.", 34, tableY + 24, {
          width: contentWidth,
          align: "center",
        });
    } else {
      if (tableY + 34 > document.page.height - 36) {
        document.addPage();
        drawPdfBrandHeader(document, "Totales del reporte", true);
        tableY = 92;
      }
      document.roundedRect(34 + contentWidth - 250, tableY + 7, 250, 26, 6).fill("#BDD8E9");
      document
        .fillColor("#001D39")
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(
          `TOTAL  ·  ${totalUnits.toLocaleString("es-BO")} unidades  ·  ${money(totalValue)}`,
          34 + contentWidth - 238,
          tableY + 16,
          { width: 226, align: "right" },
        );
      document.font("Helvetica");
    }

    const pages = document.bufferedPageRange();
    for (let index = 0; index < pages.count; index += 1) {
      document.switchToPage(index);
      const bottomMargin = document.page.margins.bottom;
      document.page.margins.bottom = 0;
      document
        .fontSize(7)
        .fillColor("#49769F")
        .text(`SCM Global · Página ${index + 1} de ${pages.count}`, 34, document.page.height - 20, {
          width: document.page.width - 68,
          align: "center",
          lineBreak: false,
        });
      document.page.margins.bottom = bottomMargin;
    }
    document.end();
  });
}

type PdfColumn = {
  label: string;
  key: string;
  width: number;
  align?: "left" | "right";
};

function drawPdfBrandHeader(
  document: PDFKit.PDFDocument,
  subtitle: string,
  compact = false,
) {
  const height = compact ? 62 : 78;
  document.rect(0, 0, document.page.width, height).fill("#001D39");
  document.roundedRect(34, compact ? 15 : 18, 34, 34, 8).fill("#7BBDE8");
  document
    .fillColor("#001D39")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("SCM", 39, compact ? 27 : 30, { width: 24, align: "center" });
  document
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(compact ? 15 : 19)
    .text("SCM Global", 80, compact ? 16 : 18);
  document
    .fillColor("#BDD8E9")
    .font("Helvetica")
    .fontSize(8.5)
    .text(subtitle, 80, compact ? 36 : 43);
  if (!compact) {
    document
      .fillColor("#7BBDE8")
      .fontSize(7)
      .text("CONTROL TOWER · REPORTE EJECUTIVO", document.page.width - 260, 30, {
        width: 226,
        align: "right",
      });
  }
}

function drawPdfTableHeader(
  document: PDFKit.PDFDocument,
  y: number,
  columns: PdfColumn[],
) {
  const width = columns.reduce((sum, column) => sum + column.width, 0);
  document.roundedRect(34, y, width, 24, 5).fill("#0A4174");
  let x = 34;
  for (const column of columns) {
    document
      .fillColor("#FFFFFF")
      .font("Helvetica-Bold")
      .fontSize(7)
      .text(column.label.toUpperCase(), x + 6, y + 9, {
        width: column.width - 12,
        lineBreak: false,
        align: column.align ?? "left",
      });
    x += column.width;
  }
  document.font("Helvetica");
}

function describePdfFilters(filters: Filters) {
  const parts = [
    filters.from ? `Desde ${filters.from}` : "",
    filters.to ? `Hasta ${filters.to}` : "",
    filters.country ? `País: ${filters.country}` : "",
    filters.supplierId ? `Proveedor ID: ${filters.supplierId}` : "",
    filters.categoryId ? `Categoría ID: ${filters.categoryId}` : "",
  ].filter(Boolean);
  return parts.length ? `Filtros: ${parts.join(" · ")}` : "Sin filtros · alcance completo";
}

function shortDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("es-BO", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
}

function money(value: number) {
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
    maximumFractionDigits: 2,
  }).format(value);
}

export default router;
