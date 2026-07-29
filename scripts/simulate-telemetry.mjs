const baseUrl = (process.env.SCM_API_URL ?? "http://127.0.0.1:4000/api").replace(/\/$/, "");
const password = process.env.SCM_DEMO_PASSWORD ?? "SCM2026!";
const intervalMs = Math.max(500, Number(process.env.SCM_TELEMETRY_INTERVAL_MS ?? 2500));
const requestTimeoutMs = Math.max(
  1000,
  Number(process.env.SCM_TELEMETRY_REQUEST_TIMEOUT_MS ?? 5000),
);
const configuredSteps = Math.max(1, Number(process.env.SCM_TELEMETRY_STEPS ?? 12));
const continuous = process.argv.includes("--continuous");
const drivers = [
  "transportista@scm.local",
  "marco.transportista@scm.local",
  "sofia.transportista@scm.local",
  "diego.transportista@scm.local",
  "elena.transportista@scm.local",
];

const sessions = [];
for (const email of drivers) {
  const login = await request("/seguridad/login", {
    method: "POST",
    body: { email, password },
  });
  if (login.status !== 200) {
    process.stdout.write(`– ${email}: no disponible (${login.status})\n`);
    continue;
  }
  sessions.push({ email, token: login.body.token });
}

if (!sessions.length) {
  throw new Error("No fue posible iniciar sesión con ningún transportista demostrativo.");
}

process.stdout.write(
  `Telemetría demostrativa iniciada para ${sessions.length} transportistas. Intervalo: ${intervalMs} ms.\n`,
);
process.stdout.write("Presione Ctrl+C para detenerla sin afectar Docker.\n");

let step = 0;
do {
  step += 1;
  for (const session of sessions) {
    const shipmentResponse = await request("/transporte/envios", { token: session.token });
    if (shipmentResponse.status !== 200) continue;
    const active = shipmentResponse.body.filter((shipment) =>
      ["EN_TRANSITO", "EN_ADUANA", "RETRASADO", "INCIDENCIA"].includes(shipment.status),
    );
    for (const shipment of active) {
      const tracking = await request(`/transporte/rastreo/${shipment.tracking_code}`);
      if (tracking.status !== 200) continue;
      const currentLat = Number(tracking.body.shipment.current_latitude);
      const currentLng = Number(tracking.body.shipment.current_longitude);
      const destinationLat = Number(tracking.body.shipment.destination_latitude);
      const destinationLng = Number(tracking.body.shipment.destination_longitude);
      const progress = continuous ? 0.035 : Math.min(0.18, 1 / (configuredSteps - step + 2));
      const latitude = currentLat + (destinationLat - currentLat) * progress;
      const longitude = currentLng + (destinationLng - currentLng) * progress;
      const event = await request(`/transporte/envios/${shipment.id}/eventos`, {
        method: "POST",
        token: session.token,
        body: {
          event_type: "UBICACION",
          description: `Telemetría demostrativa · ciclo ${step}`,
          latitude,
          longitude,
          evidence_url: null,
        },
      });
      if (event.status === 201) {
        process.stdout.write(
          `✓ ${shipment.tracking_code} · ${latitude.toFixed(4)}, ${longitude.toFixed(4)} · ${shipment.status}\n`,
        );
      } else {
        process.stdout.write(
          `! ${shipment.tracking_code}: actualización rechazada (${event.status})\n`,
        );
      }
    }
  }
  if (!continuous && step >= configuredSteps) break;
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
} while (true);

process.stdout.write(`Telemetría finalizada después de ${step} ciclos.\n`);

async function request(path, options = {}) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    return { status: response.status, body };
  } catch (cause) {
    return {
      status: 0,
      body: { message: cause instanceof Error ? cause.message : "Error de red" },
    };
  }
}
