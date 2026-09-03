import { describe, expect, it } from "vitest";
import { applyFilters, EMPTY_FILTERS, matchesSearch, sortIncidents, unitStation, involvesStation, isMajor } from "./filters";
import type { IncidentWire } from "@/types/incident";

const mk = (id: string, extra: Partial<IncidentWire> = {}): IncidentWire => ({
  id, dispatchedAt: "2026-09-03T17:31:02.000Z", callType: "ALS", category: "als", status: "dispatched", units: [{ unit: "A714" }], rawSource: "t", ...extra,
});
const list = [
  mk("a", { address: "12345 Example Farm Rd", municipality: "Poolesville", stationArea: 14, units: [{ unit: "A714" }, { unit: "M729" }] }),
  mk("b", { callType: "HOUSE FIRE", category: "structure_fire", municipality: "Silver Spring", stationArea: 1, units: [{ unit: "PE701" }, { unit: "E716" }, { unit: "T701" }, { unit: "BC703" }], latitude: 38.99, longitude: -77.03 }),
  mk("c", { callType: "PIC", category: "collision", stationArea: 29, units: [{ unit: "PE729" }, { unit: "A714" }], incidentNumber: "F26090300077" }),
];

describe("unitStation", () => {
  it("7xx numbering", () => { expect(unitStation("PE714")).toBe(14); expect(unitStation("BC705")).toBe(5); expect(unitStation("E714B")).toBe(14); });
  it("garbage", () => expect(unitStation("???")).toBeUndefined());
});

describe("applyFilters", () => {
  it("empty passes all", () => expect(applyFilters(list, EMPTY_FILTERS)).toHaveLength(3));
  it("station units", () => expect(applyFilters(list, { ...EMPTY_FILTERS, stationUnits: [14] }).map((i) => i.id)).toEqual(["a", "c"]));
  it("station area", () => expect(applyFilters(list, { ...EMPTY_FILTERS, stationAreas: [29] }).map((i) => i.id)).toEqual(["c"]));
  it("category", () => expect(applyFilters(list, { ...EMPTY_FILTERS, categories: ["structure_fire"] }).map((i) => i.id)).toEqual(["b"]));
  it("unit prefix PE does not match E", () => expect(applyFilters(list, { ...EMPTY_FILTERS, unitPrefixes: ["PE"] }).map((i) => i.id)).toEqual(["b", "c"]));
  it("unit query 714", () => expect(applyFilters(list, { ...EMPTY_FILTERS, unitQuery: "714" }).map((i) => i.id)).toEqual(["a", "c"]));
  it("min units", () => expect(applyFilters(list, { ...EMPTY_FILTERS, minUnits: 4 }).map((i) => i.id)).toEqual(["b"]));
  it("within km needs coordinates", () => expect(applyFilters(list, { ...EMPTY_FILTERS, withinKm: { latitude: 38.99, longitude: -77.03, km: 5 } }).map((i) => i.id)).toEqual(["b"]));
  it("municipality case-insensitive", () => expect(applyFilters(list, { ...EMPTY_FILTERS, municipalities: ["poolesville"] }).map((i) => i.id)).toEqual(["a"]));
});

describe("search", () => {
  it("unit", () => expect(matchesSearch(list[2], "PE729")).toBe(true));
  it("incident number", () => expect(matchesSearch(list[2], "F2609030007")).toBe(true));
  it("address word", () => expect(matchesSearch(list[0], "example farm")).toBe(true));
  it("station number", () => expect(matchesSearch(list[1], "station 1")).toBe(true));
  it("type", () => expect(matchesSearch(list[1], "house fire")).toBe(true));
  it("miss", () => expect(matchesSearch(list[0], "whites ferry")).toBe(false));
});

describe("sort / major / involves", () => {
  it("severity puts the fire first", () => expect(sortIncidents(list, "severity")[0].id).toBe("b"));
  it("major by severity or unit count", () => { expect(isMajor(list[1])).toBe(true); expect(isMajor(list[0])).toBe(false); });
  it("involvesStation via area or units", () => { expect(involvesStation(list[2], 14)).toBe(true); expect(involvesStation(list[1], 14)).toBe(false); });
});
