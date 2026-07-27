import ExcelJS from "exceljs";
import { Router } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { asyncHandler } from "../../shared/async-handler.js";
import { authenticate, requirePermission } from "../../shared/auth.js";
import { pool } from "../../shared/db.js";
import { AppError } from "../../shared/errors.js";

const router = Router();
router.use(authenticate);

const filtersSchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  country: z.string().trim().max(80).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive().optional(),
});

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
           WHERE month >= DATE_TRUNC('month',CURRENT_DATE)
             AND ($1::TEXT IS NULL OR country=$1)
             AND ($2::BIGINT IS NULL OR category_id=$2)`,
          [filters.country ?? null, filters.categoryId ?? null],
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
           FROM shipments`,
        ),
        pool.query(
          `SELECT COUNT(*)::INTEGER AS pending FROM purchase_orders
           WHERE status IN ('BORRADOR','APROBADA','ENVIADA','CONFIRMADA')`,
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
    const filters = filtersSchema.parse(request.query);
    const report = await loadReportData(filters);
    if (format === "xlsx") {
      const buffer = await buildExcel(report, filters);
      response
        .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .setHeader("Content-Disposition", 'attachment; filename="reporte-scm.xlsx"')
        .send(buffer);
      return;
    }
    const buffer = await buildPdf(report, filters);
    response
      .type("application/pdf")
      .setHeader("Content-Disposition", 'attachment; filename="reporte-scm.pdf"')
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

async function buildExcel(rows: Record<string, unknown>[], filters: Filters): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SCM Global";
  const summary = workbook.addWorksheet("Resumen");
  summary.columns = [
    { header: "Indicador", key: "indicator", width: 28 },
    { header: "Valor", key: "value", width: 24 },
  ];
  summary.addRows([
    { indicator: "Registros", value: rows.length },
    {
      indicator: "Valor total",
      value: rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0),
    },
    { indicator: "Generado", value: new Date() },
    { indicator: "Filtros", value: JSON.stringify(filters) || "Sin filtros" },
  ]);
  summary.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  summary.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  summary.getColumn("value").numFmt = '#,##0.00';

  const detail = workbook.addWorksheet("Detalle");
  detail.columns = [
    { header: "Orden", key: "code", width: 18 },
    { header: "Fecha", key: "created_at", width: 18, style: { numFmt: "yyyy-mm-dd" } },
    { header: "Estado", key: "status", width: 16 },
    { header: "Proveedor", key: "supplier", width: 28 },
    { header: "País", key: "country", width: 16 },
    { header: "SKU", key: "sku", width: 15 },
    { header: "Producto", key: "product", width: 30 },
    { header: "Categoría", key: "category", width: 18 },
    { header: "Cantidad", key: "quantity", width: 12 },
    { header: "Precio unitario", key: "unit_price", width: 18, style: { numFmt: '"Bs" #,##0.00' } },
    { header: "Total", key: "total", width: 18, style: { numFmt: '"Bs" #,##0.00' } },
  ];
  detail.addRows(rows);
  detail.autoFilter = { from: "A1", to: "K1" };
  detail.views = [{ state: "frozen", ySplit: 1 }];
  detail.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  detail.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

async function buildPdf(rows: Record<string, unknown>[], filters: Filters): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    document.rect(0, 0, 595, 72).fill("#2563EB");
    document.fillColor("#ffffff").fontSize(20).text("SCM Global", 42, 23);
    document.fontSize(10).text("Reporte consolidado de órdenes de compra", 42, 49);
    document.moveDown(3);
    document.fillColor("#0f172a").fontSize(14).text("Resumen");
    document.fontSize(9).fillColor("#64748B");
    document.text(`Generado: ${new Date().toLocaleString("es-BO")}`);
    document.text(`Filtros: ${Object.keys(filters).length ? JSON.stringify(filters) : "Sin filtros"}`);
    document.text(`Registros: ${rows.length}`);
    document.moveDown();

    for (const row of rows) {
      if (document.y > 740) document.addPage();
      document
        .fillColor("#0f172a")
        .fontSize(9)
        .text(`${row.code} · ${row.supplier} · ${row.product}`, { continued: false });
      document
        .fillColor("#64748B")
        .fontSize(8)
        .text(
          `${row.country} | ${row.status} | Cantidad: ${row.quantity} | Total: Bs ${Number(row.total).toFixed(2)}`,
        );
      document.moveDown(0.45);
    }

    const pages = document.bufferedPageRange();
    for (let index = 0; index < pages.count; index += 1) {
      document.switchToPage(index);
      document
        .fontSize(8)
        .fillColor("#64748B")
        .text(`SCM Global · Página ${index + 1} de ${pages.count}`, 42, 806, {
          width: 511,
          align: "center",
        });
    }
    document.end();
  });
}

export default router;
