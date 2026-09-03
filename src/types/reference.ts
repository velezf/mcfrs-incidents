/** Reference data served by the API (/api/stations). Authority: api/mcfrs_api/reference.py. */
export interface Apparatus { unit: string; type: string; category: string; station?: number | null; uncertain: boolean }
export interface Station {
  number: number; name: string; address: string; municipality?: string | null; latitude: number; longitude: number;
  battalion?: number | null; apparatus: string[]; apparatusParsed: Apparatus[]; notes?: string | null;
}
export interface Hospital { id: string; name: string; shortName: string; address: string; latitude: number; longitude: number; traumaLevel?: string | null; notes?: string | null }
export interface Hydrant {
  id: string; latitude: number; longitude: number; kind: string; address?: string | null; city?: string | null; mainSize?: string | null;
  outOfService: boolean; verified?: boolean | null; station?: string | null; notes?: string | null; source: string; distanceKm: number; distanceFt: number;
}
export interface HydrantsResult { nearest: Hydrant[]; searchedKm: number; note: string }
export interface Analytics {
  perDay: { day: string; count: number }[]; perHour: number[]; perStationArea: { station: number; count: number }[];
  perCategory: { category: string; count: number }[]; busiestUnits: { unit: string; count: number }[]; weekday: number; weekend: number;
  perMunicipality: { municipality: string; count: number }[]; total: number;
}
export interface PublicConfig { focusStation: number; privacyMode: "member" | "public"; pollIntervalSeconds: number; source: string }
