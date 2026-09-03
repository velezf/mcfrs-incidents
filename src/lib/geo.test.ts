import { describe, expect, it } from "vitest";
import { haversineKm, nearest, formatMiles } from "./geo";

const beallsville = { latitude: 39.17, longitude: -77.41 };
const rockville = { latitude: 39.08, longitude: -77.15 };

describe("geo", () => {
  it("haversine Beallsville-Rockville ~24 km", () => {
    const km = haversineKm(beallsville, rockville);
    expect(km).toBeGreaterThan(22);
    expect(km).toBeLessThan(26);
  });
  it("nearest sorts and limits", () => {
    const items = [{ ...rockville, n: "r" }, { ...beallsville, n: "b" }, { latitude: 38.99, longitude: -77.03, n: "ss" }];
    const near = nearest(beallsville, items, 2);
    expect(near.map((x) => x.item.n)).toEqual(["b", "r"]);
    expect(near[0].km).toBe(0);
  });
  it("formatMiles", () => expect(formatMiles(1.609344)).toBe("1.0 mi"));
});
