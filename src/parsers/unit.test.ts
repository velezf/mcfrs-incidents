import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOMENCLATURE,
  isStationUnit,
  parseUnit,
  stationFromUnitNumber,
  unitsAtStation,
  type UnitNomenclature,
} from "@/parsers/unit";

describe("stationFromUnitNumber", () => {
  it("maps county 7xx unit numbers to the station number", () => {
    expect(stationFromUnitNumber(714)).toBe(14);
    expect(stationFromUnitNumber(705)).toBe(5);
    expect(stationFromUnitNumber(729)).toBe(29);
    expect(stationFromUnitNumber(701)).toBe(1);
  });

  it("returns a bare number only when it is a plausible station (1..54)", () => {
    expect(stationFromUnitNumber(14)).toBe(14);
    expect(stationFromUnitNumber(1)).toBe(1);
    expect(stationFromUnitNumber(54)).toBe(54);
    expect(stationFromUnitNumber(0)).toBeUndefined();
    expect(stationFromUnitNumber(55)).toBeUndefined();
    expect(stationFromUnitNumber(99)).toBeUndefined();
  });

  it("rejects numbers that are neither 7xx nor a bare station", () => {
    expect(stationFromUnitNumber(614)).toBeUndefined();
    expect(stationFromUnitNumber(814)).toBeUndefined();
    expect(stationFromUnitNumber(700)).toBeUndefined();
    expect(stationFromUnitNumber(799)).toBeUndefined();
    expect(stationFromUnitNumber(7140)).toBeUndefined();
    expect(stationFromUnitNumber(-714)).toBeUndefined();
    expect(stationFromUnitNumber(Number.NaN)).toBeUndefined();
  });
});

describe("parseUnit", () => {
  it("parses a paramedic engine", () => {
    const u = parseUnit("PE714");
    expect(u).toMatchObject({
      unit: "PE714",
      prefix: "PE",
      type: "Paramedic Engine",
      category: "engine",
      station: 14,
      number: 714,
      known: true,
    });
    expect(u.suffix).toBeUndefined();
  });

  it("parses an aerial tower as a truck", () => {
    expect(parseUnit("AT714")).toMatchObject({ prefix: "AT", type: "Aerial Tower", category: "truck", station: 14 });
  });

  it("parses a plain truck", () => {
    expect(parseUnit("T714")).toMatchObject({ prefix: "T", type: "Truck", category: "truck", station: 14 });
  });

  it("parses an ambulance and a medic unit", () => {
    expect(parseUnit("A714")).toMatchObject({ prefix: "A", type: "Ambulance", category: "ambulance", station: 14 });
    expect(parseUnit("M729")).toMatchObject({ prefix: "M", type: "Medic", category: "medic", station: 29 });
  });

  it("parses a battalion chief", () => {
    expect(parseUnit("BC705")).toMatchObject({ prefix: "BC", type: "Battalion Chief", category: "chief", station: 5 });
  });

  it("parses a rescue squad", () => {
    expect(parseUnit("RS729")).toMatchObject({ prefix: "RS", type: "Rescue Squad", category: "rescue", station: 29 });
  });

  it("parses an EMS duty officer as command", () => {
    expect(parseUnit("EMS703")).toMatchObject({ prefix: "EMS", category: "command", station: 3 });
  });

  it("keeps a trailing letter as a suffix", () => {
    const u = parseUnit("E714B");
    expect(u).toMatchObject({ unit: "E714B", prefix: "E", type: "Engine", category: "engine", station: 14, suffix: "B" });
  });

  it("marks unknown prefixes as unknown but still infers the station", () => {
    const u = parseUnit("xyz714");
    expect(u.known).toBe(false);
    expect(u.category).toBe("unknown");
    expect(u.prefix).toBe("XYZ");
    expect(u.station).toBe(14);
    expect(u.number).toBe(714);
  });

  it("prefers the longest matching prefix", () => {
    expect(parseUnit("PE714").prefix).toBe("PE");
    expect(parseUnit("E714").prefix).toBe("E");
    expect(parseUnit("AT714").prefix).toBe("AT");
    expect(parseUnit("BC705").prefix).toBe("BC");
    expect(parseUnit("B705").prefix).toBe("B");
    expect(parseUnit("B705").category).toBe("special");
  });

  it("normalizes whitespace and lowercase", () => {
    const u = parseUnit("  pe714 ");
    expect(u).toMatchObject({ unit: "PE714", prefix: "PE", type: "Paramedic Engine", station: 14, known: true });
    expect(parseUnit("e 714").unit).toBe("E714");
  });

  it("ignores hyphens and dots between prefix and number", () => {
    expect(parseUnit("PE-714")).toMatchObject({ unit: "PE714", prefix: "PE", station: 14, known: true });
    expect(parseUnit("A.714")).toMatchObject({ unit: "A714", prefix: "A", station: 14, known: true });
  });

  it("handles a unit number that is not a county 7xx number", () => {
    const u = parseUnit("E14");
    expect(u).toMatchObject({ prefix: "E", station: 14, number: 14, known: true });
    expect(parseUnit("E614").station).toBeUndefined();
  });

  it("handles an empty or letters-only designator", () => {
    const empty = parseUnit("");
    expect(empty).toMatchObject({ unit: "", prefix: "", category: "unknown", known: false });
    expect(empty.station).toBeUndefined();
    expect(empty.number).toBeUndefined();

    const letters = parseUnit("PE");
    expect(letters).toMatchObject({ unit: "PE", prefix: "PE", type: "Paramedic Engine", category: "engine", known: true });
    expect(letters.station).toBeUndefined();
  });

  it("accepts a custom nomenclature that overrides the default", () => {
    const custom: UnitNomenclature[] = [
      { prefix: "PE", type: "Pumper Engine", category: "engine" },
      { prefix: "ZZ", type: "Zeppelin", category: "special" },
    ];
    expect(parseUnit("PE714", custom)).toMatchObject({ type: "Pumper Engine", category: "engine", known: true });
    expect(parseUnit("ZZ714", custom)).toMatchObject({ type: "Zeppelin", category: "special", known: true });
    // Not in the custom table, so unknown even though the default knows it.
    expect(parseUnit("A714", custom).known).toBe(false);
  });

  it("ships a default nomenclature with unique prefixes", () => {
    const prefixes = DEFAULT_NOMENCLATURE.map((n) => n.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    expect(prefixes).toEqual(expect.arrayContaining(["PE", "E", "T", "AT", "A", "M", "RS", "BC", "EMS", "U", "HM"]));
  });
});

describe("station helpers", () => {
  const units = ["PE714", "A714", "M729", "BC705", "xyz714", "E714B", "U799", ""];

  it("filters units by station", () => {
    expect(unitsAtStation(units, 14)).toEqual(["PE714", "A714", "xyz714", "E714B"]);
    expect(unitsAtStation(units, 29)).toEqual(["M729"]);
    expect(unitsAtStation(units, 99)).toEqual([]);
  });

  it("tests a single unit against a station", () => {
    expect(isStationUnit("PE714", 14)).toBe(true);
    expect(isStationUnit("pe714", 14)).toBe(true);
    expect(isStationUnit("PE714", 7)).toBe(false);
    expect(isStationUnit("", 14)).toBe(false);
  });
});

describe("Station 14 roster designators (sourced 2026-09-03)", () => {
  it("PRE714 is a Paramedic Rescue Engine at station 14", () => {
    const p = parseUnit("PRE714");
    expect([p.prefix, p.type, p.category, p.station, p.known]).toEqual(["PRE", "Paramedic Rescue Engine", "engine", 14, true]);
  });
  it("BE714 brush engine, BT714 boat, BS714B boat support with suffix, CH714 chief", () => {
    expect(parseUnit("BE714").type).toBe("Brush Engine");
    expect(parseUnit("BT714").type).toBe("Boat");
    expect([parseUnit("BS714B").type, parseUnit("BS714B").suffix]).toEqual(["Boat Support", "B"]);
    expect(parseUnit("CH714").category).toBe("chief");
    expect(parseUnit("UTV714").type).toBe("UTV");
  });
  it("longest prefix still wins: PRE before PE and RE, BS before B, UTV before UT", () => {
    expect(parseUnit("PE714").prefix).toBe("PE");
    expect(parseUnit("RE714").prefix).toBe("RE");
    expect(parseUnit("B714").prefix).toBe("B");
    expect(parseUnit("UT714").prefix).toBe("UT");
  });
});

