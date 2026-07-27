import { describe, expect, it } from "vitest";
import { estimateDuration, haversineKm, routeDistance } from "../src/shared/geo.js";

describe("cálculos de rutas", () => {
  it("calcula una distancia razonable entre La Paz y Lima", () => {
    const distance = haversineKm(
      { lat: -16.5, lng: -68.15 },
      { lat: -12.0464, lng: -77.0428 },
    );
    expect(distance).toBeGreaterThan(1000);
    expect(distance).toBeLessThan(1200);
  });

  it("suma escalas y estima duración por modo", () => {
    const distance = routeDistance([
      { lat: -16.5, lng: -68.15 },
      { lat: -16.5656, lng: -69.0417 },
      { lat: -12.0464, lng: -77.0428 },
    ]);
    expect(distance).toBeGreaterThan(1000);
    expect(estimateDuration(distance, "AEREO")).toBeLessThan(
      estimateDuration(distance, "TERRESTRE"),
    );
  });
});
