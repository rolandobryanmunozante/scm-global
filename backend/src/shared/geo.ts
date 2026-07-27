export interface Coordinate {
  lat: number;
  lng: number;
}

export function haversineKm(a: Coordinate, b: Coordinate): number {
  const radius = 6371;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const latitudeA = radians(a.lat);
  const latitudeB = radians(b.lat);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(value));
}

export function routeDistance(points: Coordinate[]): number {
  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index];
    return previous ? total + haversineKm(previous, point) : total;
  }, 0);
}

export function estimateDuration(distanceKm: number, mode: string): number {
  const speeds: Record<string, number> = {
    TERRESTRE: 45,
    MARITIMO: 28,
    AEREO: 650,
  };
  return distanceKm / (speeds[mode] ?? 45);
}
