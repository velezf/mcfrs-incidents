import { describe, expect, it } from "vitest";
import { applyPrivacy, maskAddress, fuzzCoordinate } from "./privacy";
import type { Incident } from "@/types/incident";

const base: Incident = {
  id: "t:1", dispatchedAt: new Date("2026-09-03T17:31:02Z"), callType: "ALS", category: "als", status: "dispatched",
  address: "12345 Example Farm Rd", crossStreet: "Test Ln", latitude: 39.17123, longitude: -77.41321, units: [], rawSource: "t",
  rawPayload: { secret: "x" },
};

describe("maskAddress", () => {
  it("block", () => expect(maskAddress("12345 Example Farm Rd", "block")).toBe("12300 blk Example Farm Rd"));
  it("street", () => expect(maskAddress("12345 Example Farm Rd", "street")).toBe("Example Farm Rd"));
  it("exact", () => expect(maskAddress("12345 Example Farm Rd", "exact")).toBe("12345 Example Farm Rd"));
  it("no number passes through", () => expect(maskAddress("I-270 NB AT EXIT 22", "block")).toBe("I-270 NB AT EXIT 22"));
});

describe("applyPrivacy", () => {
  const pub = { mode: "public" as const, maskMedicalAddresses: true, precision: "block" as const };
  it("member mode is identity", () => expect(applyPrivacy(base, { ...pub, mode: "member" })).toBe(base));
  it("public masks medical address, cross street, coordinates and drops raw payload", () => {
    const p = applyPrivacy(base, pub);
    expect(p.address).toBe("12300 blk Example Farm Rd");
    expect(p.crossStreet).toBeUndefined();
    expect(p.latitude).toBe(fuzzCoordinate(39.17123));
    expect(p.rawPayload).toBeUndefined();
  });
  it("public leaves a fire address exact but still drops raw payload", () => {
    const p = applyPrivacy({ ...base, category: "structure_fire" }, pub);
    expect(p.address).toBe("12345 Example Farm Rd");
    expect(p.rawPayload).toBeUndefined();
  });
  it("mask flag off keeps medical address", () => {
    expect(applyPrivacy(base, { ...pub, maskMedicalAddresses: false }).address).toBe("12345 Example Farm Rd");
  });
});
