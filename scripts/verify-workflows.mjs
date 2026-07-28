import assert from "node:assert/strict";

const baseUrl = (process.env.SCM_API_URL ?? "http://127.0.0.1:4000/api").replace(/\/$/, "");
const password = process.env.SCM_TEST_PASSWORD ?? "SCM2026!";
const driverPassword = "SCM2026!Test";
const stamp = Date.now().toString(36);

const admin = await login("admin@scm.local");
const purchases = await login("compras@scm.local");
const inventory = await login("inventario@scm.local");
const logistics = await login("logistica@scm.local");
const supplierPortal = await login("proveedor@scm.local");

const suppliers = await ok("/proveedores?active=true", { token: purchases.token });
const products = await ok("/inventarios/productos", { token: purchases.token });
const warehouses = await ok("/inventarios/almacenes", { token: inventory.token });
const supplier = suppliers.find((item) => item.code === "PRV-0001");
const product = products.find((item) => Number(item.category_id) === Number(supplier.category_id));
const warehouse = warehouses.find((item) => item.code === "ALM-LPZ");
assert.ok(supplier && product && warehouse, "No se encontraron datos base para el flujo de compras");

const order = await ok("/inventarios/ordenes-compra", {
  method: "POST",
  token: purchases.token,
  expected: 201,
  body: {
    supplier_id: supplier.id,
    expected_delivery_date: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
    notes: "Prueba integral automatizada",
    items: [{ product_id: product.id, quantity: 3 }],
  },
});
await ok(`/inventarios/ordenes-compra/${order.id}/aprobar`, {
  method: "POST",
  token: purchases.token,
});

const portalOrders = await ok("/proveedores/portal/ordenes", { token: supplierPortal.token });
assert.ok(portalOrders.some((item) => Number(item.id) === Number(order.id)));
await ok(`/proveedores/portal/ordenes/${order.id}`, {
  method: "PATCH",
  token: supplierPortal.token,
  body: {
    expected_delivery_date: new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10),
    document_url: "https://example.com/orden-prueba.pdf",
  },
});
await ok(`/inventarios/ordenes-compra/${order.id}/recibir`, {
  method: "POST",
  token: inventory.token,
  body: { warehouse_id: warehouse.id },
});
const receivedOrders = await ok("/inventarios/ordenes-compra", { token: inventory.token });
assert.equal(receivedOrders.find((item) => Number(item.id) === Number(order.id)).status, "RECIBIDA");
process.stdout.write("✓ compra manual, aprobación, confirmación y recepción\n");

const roles = await ok("/seguridad/roles", { token: admin.token });
const driverRole = roles.find((role) => role.code === "DRIVER");
const driverEmail = `driver-${stamp}@scm.local`;
await ok("/seguridad/usuarios", {
  method: "POST",
  token: admin.token,
  expected: 201,
  body: {
    full_name: `Conductor Integral ${stamp}`,
    email: driverEmail,
    password: driverPassword,
    role_id: driverRole.id,
    language: "es",
    license_number: `TEST-${stamp}`,
    license_expiry: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
  },
});
const driver = await login(driverEmail, driverPassword);

const routes = await ok("/logistica/rutas", { token: logistics.token });
const inboundRoute = routes.find(
  (item) =>
    item.destination_warehouse_id &&
    ["ENTRADA_COMPRA", "AMBOS"].includes(item.purpose),
);
assert.ok(inboundRoute, "No existe una ruta compatible con compras entrantes");
const inboundOrder = await ok("/inventarios/ordenes-compra", {
  method: "POST",
  token: purchases.token,
  expected: 201,
  body: {
    supplier_id: supplier.id,
    expected_delivery_date: new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10),
    notes: "Compra entrante con transporte automatizado",
    items: [{ product_id: product.id, quantity: 3 }],
  },
});
await ok(`/inventarios/ordenes-compra/${inboundOrder.id}/aprobar`, {
  method: "POST",
  token: purchases.token,
});
await ok(`/proveedores/portal/ordenes/${inboundOrder.id}`, {
  method: "PATCH",
  token: supplierPortal.token,
  body: {
    expected_delivery_date: new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10),
    document_url: "https://example.com/compra-entrante.pdf",
  },
});
const inboundBeforeRows = await stockAt(logistics.token, inboundRoute.destination_warehouse_id);
const inboundBefore = warehouseStock(
  inboundBeforeRows.find((item) => Number(item.product_id) === Number(product.id)),
  inboundRoute.destination_warehouse_id,
);
const inboundShipment = await ok("/logistica/envios", {
  method: "POST",
  token: logistics.token,
  expected: 201,
  body: {
    route_id: inboundRoute.id,
    purchase_order_id: inboundOrder.id,
    destination_warehouse_id: inboundRoute.destination_warehouse_id,
    total_weight_kg: 180,
    total_volume_m3: 1.5,
    items: [],
  },
});
assert.equal(inboundShipment.flow_type, "ENTRADA_COMPRA");
assert.equal(inboundShipment.origin_warehouse_id, null);
await ok(`/inventarios/ordenes-compra/${inboundOrder.id}/recibir`, {
  method: "POST",
  token: inventory.token,
  expected: 409,
  body: { warehouse_id: inboundRoute.destination_warehouse_id },
});
const inboundVehicles = await ok("/transporte/vehiculos", { token: logistics.token });
const inboundVehicle = inboundVehicles.find(
  (item) =>
    item.available &&
    item.active &&
    item.transport_mode === inboundRoute.transport_mode &&
    Number(item.capacity_kg) >= 180 &&
    Number(item.capacity_m3) >= 1.5,
);
assert.ok(inboundVehicle, "No existe vehículo disponible para la compra entrante");
await ok(`/transporte/envios/${inboundShipment.id}/asignar`, {
  method: "PATCH",
  token: logistics.token,
  body: { vehicle_id: inboundVehicle.id, driver_id: driver.user.id },
});
await ok(`/transporte/envios/${inboundShipment.id}/eventos`, {
  method: "POST",
  token: driver.token,
  expected: 201,
  body: {
    event_type: "ENTREGA",
    description: "Compra recibida por la prueba integral",
    latitude: Number(inboundRoute.destination_latitude),
    longitude: Number(inboundRoute.destination_longitude),
    evidence_url: "https://example.com/recepcion-compra.jpg",
  },
});
const inboundAfterRows = await stockAt(logistics.token, inboundRoute.destination_warehouse_id);
const inboundAfter = warehouseStock(
  inboundAfterRows.find((item) => Number(item.product_id) === Number(product.id)),
  inboundRoute.destination_warehouse_id,
);
assert.equal(inboundAfter.current, inboundBefore.current + 3);
const ordersAfterInbound = await ok("/inventarios/ordenes-compra", { token: inventory.token });
assert.equal(
  ordersAfterInbound.find((item) => Number(item.id) === Number(inboundOrder.id)).status,
  "RECIBIDA",
);
process.stdout.write("✓ compra entrante, transporte, recepción e inventario destino\n");

const route = routes.find(
  (item) =>
    item.origin_warehouse_id &&
    item.destination_warehouse_id &&
    ["SALIDA_DISTRIBUCION", "AMBOS"].includes(item.purpose),
);
assert.ok(route, "No existe una ruta vinculada a almacenes");
const stockBefore = await stockAt(logistics.token, route.origin_warehouse_id);
const outboundProduct = stockBefore.find((item) => Number(item.available) >= 10);
assert.ok(outboundProduct, "No existe stock suficiente para probar el despacho");
const originBefore = warehouseStock(outboundProduct, route.origin_warehouse_id);
const destinationBeforeRows = await stockAt(logistics.token, route.destination_warehouse_id);
const destinationBefore = warehouseStock(
  destinationBeforeRows.find((item) => Number(item.product_id) === Number(outboundProduct.product_id)),
  route.destination_warehouse_id,
);

const shipment = await ok("/logistica/envios", {
  method: "POST",
  token: logistics.token,
  expected: 201,
  body: {
    route_id: route.id,
    origin_warehouse_id: route.origin_warehouse_id,
    destination_warehouse_id: route.destination_warehouse_id,
    total_weight_kg: 250,
    total_volume_m3: 2,
    items: [{ product_id: outboundProduct.product_id, quantity: 2 }],
  },
});
assert.equal(shipment.flow_type, "SALIDA_DISTRIBUCION");
const afterReservationRows = await stockAt(logistics.token, route.origin_warehouse_id);
const afterReservation = warehouseStock(
  afterReservationRows.find((item) => Number(item.product_id) === Number(outboundProduct.product_id)),
  route.origin_warehouse_id,
);
assert.equal(afterReservation.current, originBefore.current);
assert.equal(afterReservation.reserved, originBefore.reserved + 2);

const vehicles = await ok("/transporte/vehiculos", { token: logistics.token });
const vehicle = vehicles.find(
  (item) =>
    item.available &&
    item.active &&
    item.transport_mode === route.transport_mode &&
    Number(item.capacity_kg) >= 250 &&
    Number(item.capacity_m3) >= 2,
);
assert.ok(vehicle, "No existe vehículo disponible para la prueba");
await ok(`/transporte/envios/${shipment.id}/asignar`, {
  method: "PATCH",
  token: logistics.token,
  body: { vehicle_id: vehicle.id, driver_id: driver.user.id },
});
const afterDispatchRows = await stockAt(logistics.token, route.origin_warehouse_id);
const afterDispatch = warehouseStock(
  afterDispatchRows.find((item) => Number(item.product_id) === Number(outboundProduct.product_id)),
  route.origin_warehouse_id,
);
assert.equal(afterDispatch.current, originBefore.current - 2);
assert.equal(afterDispatch.reserved, originBefore.reserved);

await ok(`/transporte/envios/${shipment.id}/eventos`, {
  method: "POST",
  token: driver.token,
  expected: 201,
  body: {
    event_type: "ENTREGA",
    description: "Entrega confirmada por la prueba integral",
    latitude: Number(route.destination_latitude),
    longitude: Number(route.destination_longitude),
    evidence_url: "https://example.com/evidencia-prueba.jpg",
  },
});
const destinationAfterRows = await stockAt(logistics.token, route.destination_warehouse_id);
const destinationAfter = warehouseStock(
  destinationAfterRows.find((item) => Number(item.product_id) === Number(outboundProduct.product_id)),
  route.destination_warehouse_id,
);
assert.equal(destinationAfter.current, destinationBefore.current + 2);

const publicTracking = await ok(`/transporte/rastreo/${shipment.tracking_code}`);
assert.equal(publicTracking.shipment.status, "ENTREGADO");
assert.ok(publicTracking.events.some((event) => event.event_type === "ENTREGA"));
process.stdout.write("✓ reserva, despacho, entrega, inventario destino y rastreo\n");

await ok(`/seguridad/usuarios/${admin.user.id}`, {
  method: "PATCH",
  token: admin.token,
  expected: 400,
  body: { active: false },
});
await ok(`/seguridad/usuarios/${driver.user.id}`, {
  method: "PATCH",
  token: admin.token,
  body: { active: false },
});
await ok("/seguridad/me", {
  token: driver.token,
  expected: 401,
});
process.stdout.write("✓ protección del último administrador y revocación inmediata de sesión\n");

async function login(email, credential = password) {
  const response = await ok("/seguridad/login", {
    method: "POST",
    body: { email, password: credential },
  });
  return { token: response.token, user: response.user };
}

async function stockAt(token, warehouseId) {
  return ok(`/inventarios/stock?warehouseId=${warehouseId}`, { token });
}

function warehouseStock(row, warehouseId) {
  const value = row?.warehouses?.find((item) => Number(item.warehouse_id) === Number(warehouseId));
  return {
    current: Number(value?.current ?? 0),
    reserved: Number(value?.reserved ?? 0),
  };
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
