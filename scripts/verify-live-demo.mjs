import assert from "node:assert/strict";

const baseUrl = (process.env.SCM_API_URL ?? "http://127.0.0.1:4000/api").replace(/\/$/, "");
const password = process.env.SCM_TEST_PASSWORD ?? "SCM2026!";

const adminLogin = await ok("/seguridad/login", {
  method: "POST",
  body: { email: "admin@scm.local", password },
});
const environment = await ok("/demo/estado", { token: adminLogin.token });
assert.equal(environment.enabled, true, "DEMO_MODE debe estar activo en el entorno de prueba");
assert.equal(environment.isolated, true);
const bootstrap = await ok("/demo/sesiones", {
  method: "POST",
  token: adminLogin.token,
});
const sessions = bootstrap.sessions;
const requiredRoles = [
  "ADMIN",
  "PURCHASE_MANAGER",
  "SUPPLIER",
  "LOGISTICS_MANAGER",
  "DRIVER",
  "INVENTORY_MANAGER",
  "MANAGER",
  "AUDITOR",
  "CLIENT",
];
assert.deepEqual(Object.keys(sessions).sort(), requiredRoles.sort());

const token = (role) => sessions[role].token;
const suppliers = await ok("/proveedores?active=true", { token: token("PURCHASE_MANAGER") });
const supplier = suppliers.find((item) => item.code === "PRV-0001");
assert.ok(supplier, "No existe PRV-0001");
const catalog = await ok(`/proveedores/${supplier.id}/catalogo`, {
  token: token("PURCHASE_MANAGER"),
});
const product = catalog.products[0];
assert.ok(product, "El proveedor no tiene catálogo");
const delivery = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

let order = await ok("/inventarios/ordenes-compra", {
  method: "POST",
  token: token("PURCHASE_MANAGER"),
  expected: 201,
  body: {
    supplier_id: supplier.id,
    expected_delivery_date: delivery,
    notes: "Verificación de demo operativa en vivo",
    items: [{ product_id: product.id, quantity: 5 }],
  },
});
assert.equal(order.status, "BORRADOR");
order = await ok(`/inventarios/ordenes-compra/${order.id}/aprobar`, {
  method: "POST",
  token: token("PURCHASE_MANAGER"),
});
assert.equal(order.status, "APROBADA");
const portalOrders = await ok("/proveedores/portal/ordenes", { token: token("SUPPLIER") });
assert.ok(portalOrders.some((item) => Number(item.id) === Number(order.id)));
order = await ok(`/proveedores/portal/ordenes/${order.id}`, {
  method: "PATCH",
  token: token("SUPPLIER"),
  body: {
    expected_delivery_date: delivery,
    document_url: "https://example.com/demo/factura-proveedor.pdf",
  },
});
assert.equal(order.status, "CONFIRMADA");

const routes = await ok("/logistica/rutas", { token: token("LOGISTICS_MANAGER") });
const candidates = routes.filter(
  (route) =>
    route.destination_warehouse_id &&
    route.transport_mode === "TERRESTRE" &&
    ["ENTRADA_COMPRA", "AMBOS"].includes(route.purpose),
);
const template =
  candidates.find((route) => route.origin_name.toLowerCase().includes("andes")) ?? candidates[0];
assert.ok(template, "No existe ruta terrestre entrante");
const route = await ok("/logistica/rutas", {
  method: "POST",
  token: token("LOGISTICS_MANAGER"),
  expected: 201,
  body: {
    name: `Ruta demo ${order.code}`,
    origin: {
      name: template.origin_name,
      country: template.origin_country,
      lat: Number(template.origin_latitude),
      lng: Number(template.origin_longitude),
    },
    destination: {
      name: template.destination_name,
      country: template.destination_country,
      lat: Number(template.destination_latitude),
      lng: Number(template.destination_longitude),
    },
    stops: [],
    transport_mode: template.transport_mode,
    purpose: "ENTRADA_COMPRA",
    is_template: false,
  },
});
assert.ok(route.destination_warehouse_id);
const stockBeforeRows = await stockAt(token("INVENTORY_MANAGER"), route.destination_warehouse_id);
const stockBefore = warehouseStock(stockBeforeRows, product.id, route.destination_warehouse_id);

let shipment = await ok("/logistica/envios", {
  method: "POST",
  token: token("LOGISTICS_MANAGER"),
  expected: 201,
  body: {
    route_id: route.id,
    purchase_order_id: order.id,
    destination_warehouse_id: route.destination_warehouse_id,
    total_weight_kg: 240,
    total_volume_m3: 2.4,
    items: [],
  },
});
assert.equal(shipment.status, "PREPARANDO");
const [vehicles, drivers] = await Promise.all([
  ok("/transporte/vehiculos", { token: token("LOGISTICS_MANAGER") }),
  ok("/transporte/transportistas", { token: token("LOGISTICS_MANAGER") }),
]);
const vehicle = vehicles.find(
  (item) =>
    item.available &&
    item.active &&
    item.transport_mode === route.transport_mode &&
    Number(item.capacity_kg) >= 240 &&
    Number(item.capacity_m3) >= 2.4,
);
const driver = drivers.find(
  (item) =>
    Number(item.id) === Number(sessions.DRIVER.user.id) &&
    item.available &&
    item.license_valid,
);
assert.ok(vehicle && driver, "No existe transporte compatible para la demo");
shipment = await ok(`/transporte/envios/${shipment.id}/asignar`, {
  method: "PATCH",
  token: token("LOGISTICS_MANAGER"),
  body: { vehicle_id: vehicle.id, driver_id: driver.id },
});
assert.equal(shipment.status, "ASIGNADO");
shipment = await ok(`/transporte/envios/${shipment.id}/aceptar`, {
  method: "POST",
  token: token("DRIVER"),
});
assert.equal(shipment.status, "EN_TRANSITO");

const latitude =
  (Number(route.origin_latitude) + Number(route.destination_latitude)) / 2;
const longitude =
  (Number(route.origin_longitude) + Number(route.destination_longitude)) / 2;
await event(shipment.id, "UBICACION", {
  description: "Posición GPS transmitida por la demo",
  latitude,
  longitude,
});
let eventResult = await event(shipment.id, "RETRASO", {
  description: "Demora preventiva por congestión",
  delay_minutes: 25,
  latitude,
  longitude,
});
assert.equal(eventResult.shipment.status, "RETRASADO");
eventResult = await event(shipment.id, "INCIDENCIA", {
  description: "Bloqueo parcial de vía",
  incident_type: "TRAFICO",
  latitude,
  longitude,
  evidence_url: "https://example.com/demo/evidencia-incidencia.jpg",
});
assert.equal(eventResult.shipment.status, "INCIDENCIA");
eventResult = await event(shipment.id, "RESOLUCION", {
  description: "Vía liberada; recorrido reanudado",
  latitude,
  longitude,
});
assert.equal(eventResult.shipment.status, "EN_TRANSITO");
eventResult = await event(shipment.id, "ARRIBO", {
  description: "Carga arribó al almacén",
  latitude: Number(route.destination_latitude),
  longitude: Number(route.destination_longitude),
  evidence_url: "https://example.com/demo/arribo-almacen.jpg",
});
assert.equal(eventResult.shipment.status, "PENDIENTE_RECEPCION");

await ok(`/inventarios/ordenes-compra/${order.id}/recibir`, {
  method: "POST",
  token: token("INVENTORY_MANAGER"),
  body: { warehouse_id: route.destination_warehouse_id },
});
const stockAfterRows = await stockAt(token("INVENTORY_MANAGER"), route.destination_warehouse_id);
const stockAfter = warehouseStock(stockAfterRows, product.id, route.destination_warehouse_id);
assert.equal(stockAfter, stockBefore + 5);

const to = new Date().toISOString().slice(0, 10);
const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
await ok(`/reportes/dashboard?from=${from}&to=${to}`, { token: token("MANAGER") });
const [pdf, xlsx] = await Promise.all([
  file(`/reportes/exportar?format=pdf&from=${from}&to=${to}`, token("MANAGER")),
  file(`/reportes/exportar?format=xlsx&from=${from}&to=${to}`, token("MANAGER")),
]);
assert.ok(pdf > 1000 && xlsx > 1000, "Las exportaciones de la demo están vacías");
const audits = await ok("/reportes/auditoria?limit=100", { token: token("AUDITOR") });
assert.ok(
  audits.some(
    (item) => item.entity_type === "shipment" && Number(item.entity_id) === Number(shipment.id),
  ),
);
const tracking = await ok(`/transporte/rastreo/${shipment.tracking_code}`);
assert.equal(tracking.shipment.status, "ENTREGADO");
for (const expected of ["INCIDENCIA", "RESOLUCION", "ARRIBO", "ENTREGA"]) {
  assert.ok(tracking.events.some((item) => item.event_type === expected), `Falta ${expected}`);
}

process.stdout.write(
  `✓ demo operativa: 9 roles, ${order.code}, ${shipment.tracking_code}, ` +
    `stock ${stockBefore}→${stockAfter}, PDF/Excel, auditoría y rastreo\n`,
);

async function event(shipmentId, eventType, body) {
  return ok(`/transporte/envios/${shipmentId}/eventos`, {
    method: "POST",
    token: token("DRIVER"),
    expected: 201,
    body: { event_type: eventType, ...body },
  });
}

async function stockAt(credential, warehouseId) {
  return ok(`/inventarios/stock?warehouseId=${warehouseId}`, { token: credential });
}

function warehouseStock(rows, productId, warehouseId) {
  const row = rows.find((item) => Number(item.product_id) === Number(productId));
  const stock = row?.warehouses?.find(
    (item) => Number(item.warehouse_id) === Number(warehouseId),
  );
  return Number(stock?.current ?? 0);
}

async function file(path, credential) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${credential}` },
  });
  if (response.status !== 200) {
    const text = await response.text();
    assert.equal(response.status, 200, `${path}: ${response.status} ${text}`);
  }
  return (await response.arrayBuffer()).byteLength;
}

async function ok(path, options = {}) {
  const expected = options.expected ?? 200;
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  assert.equal(
    response.status,
    expected,
    `${options.method ?? "GET"} ${path}: ${response.status} ${text}`,
  );
  return body;
}
