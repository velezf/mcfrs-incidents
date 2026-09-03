/** Pure geometry helpers. Distances are great-circle ("as the crow flies"), never road distance. */
export interface LatLng {
  latitude: number;
  longitude: number;
}

const R_KM = 6371.0088;
const MI_PER_KM = 0.621371;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude);
  const la2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

export function kmToMiles(km: number): number {
  return km * MI_PER_KM;
}

export function formatMiles(km: number): string {
  const mi = kmToMiles(km);
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

export interface Near<T> {
  item: T;
  km: number;
}

/** Items within `withinKm` of `from`, nearest first. */
export function nearest<T extends LatLng>(from: LatLng, items: readonly T[], limit = 5, withinKm = Infinity): Near<T>[] {
  return items
    .map((item) => ({ item, km: haversineKm(from, item) }))
    .filter((n) => n.km <= withinKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}

export function hasLocation(x: { latitude?: number; longitude?: number }): x is LatLng {
  return typeof x.latitude === "number" && typeof x.longitude === "number" && Number.isFinite(x.latitude) && Number.isFinite(x.longitude);
}

/** Montgomery County, MD rough bounding box for map defaults. */
export const COUNTY_BOUNDS = { south: 38.93, west: -77.53, north: 39.35, east: -76.89 } as const;
export const COUNTY_CENTER: LatLng = { latitude: 39.14, longitude: -77.2 };
