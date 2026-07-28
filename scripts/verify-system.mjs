import assert from "node:assert/strict";

const baseUrl = (process.env.SCM_API_URL ?? "http://127.0.0.1:4000/api").replace(/\/$/, "");
const password = process.env.SCM_TEST_PASSWORD ?? "SCM2026!";

const roles = [
  {
    email: "admin@scm.local",
    role: "ADMIN",
    allowed: "/seguridad/usuarios",
  },
  {
    email: "compras@scm.local",
    role: "PURCHASE_MANAGER",
    allowed: "/proveedores",
    forbidden: "/seguridad/usuarios",
  },
  {
    email: "inventario@scm.local",
    role: "INVENTORY_MANAGER",
    allowed: "/inventarios/stock",
    forbidden: "/seguridad/usuarios",
  },
  {
    email: "logistica@scm.local",
    role: "LOGISTICS_MANAGER",
    allowed: "/transporte/envios",
    forbidden: "/proveedores",
  },
  {
    email: "transportista@scm.local",
    role: "DRIVER",
    allowed: "/transporte/envios",
    forbidden: "/inventarios/stock",
  },
  {
    email: "gerente@scm.local",
    role: "MANAGER",
    allowed: "/reportes/dashboard",
    forbidden: "/seguridad/usuarios",
  },
  {
    email: "cliente@scm.local",
    role: "CLIENT",
    allowed: "/seguridad/me",
    forbidden: "/transporte/envios",
  },
  {
    email: "proveedor@scm.local",
    role: "SUPPLIER",
    allowed: "/proveedores/portal/ordenes",
    forbidden: "/inventarios/stock",
  },
  {
    email: "auditor@scm.local",
    role: "AUDITOR",
    allowed: "/reportes/auditoria",
    forbidden: "/inventarios/movimientos",
  },
];
const roleTokens = new Map();

const health = await request("/health");
assert.equal(health.status, 200, `Health respondió ${health.status}`);
assert.equal(health.body.status, "ok");

for (const expected of roles) {
  const login = await request("/seguridad/login", {
    method: "POST",
    body: { email: expected.email, password },
  });
  assert.equal(login.status, 200, `${expected.email}: login ${login.status}`);
  assert.equal(login.body.user.role, expected.role, `${expected.email}: rol inesperado`);
  assert.ok(login.body.user.permissions instanceof Array, `${expected.email}: permisos inválidos`);
  assert.equal(typeof login.body.user.authVersion, "number", `${expected.email}: authVersion ausente`);
  roleTokens.set(expected.role, login.body.token);

  const allowed = await request(expected.allowed, { token: login.body.token });
  assert.equal(allowed.status, 200, `${expected.role}: ${expected.allowed} respondió ${allowed.status}`);
  if (login.body.user.permissions.includes("reports.read")) {
    const filters = await request("/reportes/filtros", { token: login.body.token });
    assert.equal(filters.status, 200, `${expected.role}: no pudo cargar filtros de reportes`);
    assert.ok(filters.body.suppliers instanceof Array, `${expected.role}: proveedores de reporte inválidos`);
    assert.ok(filters.body.products instanceof Array, `${expected.role}: productos de reporte inválidos`);
  }
  if (expected.forbidden) {
    const forbidden = await request(expected.forbidden, { token: login.body.token });
    assert.equal(
      forbidden.status,
      403,
      `${expected.role}: ${expected.forbidden} debía responder 403 y respondió ${forbidden.status}`,
    );
  }
  process.stdout.write(`✓ ${expected.role}\n`);
}

for (const trackingCode of [
  "SCM-BO-2026-001",
  "SCM-BR-2026-003",
  "SCM-AR-2026-004",
  "SCM-BO-2026-008",
]) {
  const tracking = await request(`/transporte/rastreo/${trackingCode}`);
  assert.equal(tracking.status, 200, `${trackingCode}: rastreo respondió ${tracking.status}`);
  assert.equal(tracking.body.shipment.tracking_code, trackingCode);
  assert.ok(tracking.body.items instanceof Array && tracking.body.items.length > 0);
  assert.equal(typeof tracking.body.shipment.position_state, "string");
  assert.equal(typeof tracking.body.shipment.incident_count, "number");
}

const operationalMap = await request("/logistica/mapa-envios", {
  token: roleTokens.get("LOGISTICS_MANAGER"),
});
assert.equal(operationalMap.status, 200, `Mapa global respondió ${operationalMap.status}`);
assert.ok(operationalMap.body.length >= 5, "El mapa debe incluir varios flujos activos");
assert.ok(
  operationalMap.body.some((shipment) => shipment.status === "INCIDENCIA"),
  "El mapa debe incluir una incidencia demostrativa",
);
assert.ok(
  operationalMap.body.some((shipment) => shipment.status === "RETRASADO"),
  "El mapa debe incluir un retraso demostrativo",
);

const missingTracking = await request("/transporte/rastreo/SCM-NO-EXISTE");
assert.equal(missingTracking.status, 404);
process.stdout.write("✓ rastreo público y aislamiento por roles\n");

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { status: response.status, body };
}
