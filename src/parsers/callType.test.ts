import { describe, expect, it } from "vitest";
import { CALL_TYPE_RULES, classifyCallType, type CallTypeRule } from "@/parsers/callType";
import { INCIDENT_CATEGORIES } from "@/types/incident";

describe("classifyCallType", () => {
  it("classifies structure fires", () => {
    for (const ct of ["HOUSE FIRE", "APARTMENT FIRE", "BUILDING FIRE", "STRUCTURE FIRE", "Townhouse Fire"]) {
      const info = classifyCallType(ct);
      expect(info.category, ct).toBe("structure_fire");
      expect(info.severity, ct).toBe(4);
    }
  });

  it("classifies a working fire as the top severity and major", () => {
    const info = classifyCallType("WORKING FIRE");
    expect(info).toMatchObject({ category: "working_fire", severity: 5, major: true });
  });

  it("classifies fire alarms", () => {
    for (const ct of ["FIRE ALARM", "ALARM SOUNDING", "CO ALARM", "Smoke Detector"]) {
      const info = classifyCallType(ct);
      expect(info.category, ct).toBe("fire_alarm");
      expect(info.major, ct).toBe(false);
    }
  });

  it("classifies brush / outside fires", () => {
    for (const ct of ["BRUSH FIRE", "OUTSIDE FIRE", "WOODS FIRE"]) {
      expect(classifyCallType(ct).category, ct).toBe("brush_fire");
    }
  });

  it("classifies vehicle fires", () => {
    for (const ct of ["VEHICLE FIRE", "CAR FIRE"]) {
      expect(classifyCallType(ct).category, ct).toBe("vehicle_fire");
    }
  });

  it("classifies collisions", () => {
    for (const ct of ["PIC", "PERSONAL INJURY COLLISION", "MVC", "MVA", "AUTO ACCIDENT", "COLLISION", "PEDESTRIAN STRUCK"]) {
      const info = classifyCallType(ct);
      expect(info.category, ct).toBe("collision");
      expect(info.severity, ct).toBe(3);
    }
  });

  it("escalates a collision with entrapment / rollover to rescue severity 4", () => {
    for (const ct of ["PIC WITH ENTRAPMENT", "MVC OVERTURNED", "COLLISION ROLLOVER"]) {
      const info = classifyCallType(ct);
      expect(info.category, ct).toBe("rescue");
      expect(info.severity, ct).toBe(4);
    }
  });

  it("classifies ALS calls", () => {
    for (const ct of ["ALS", "ALS1", "ALS2", "CARDIAC ARREST", "CHEST PAIN", "STROKE", "DIFFICULTY BREATHING"]) {
      const info = classifyCallType(ct);
      expect(info.category, ct).toBe("als");
      expect(info.severity, ct).toBe(3);
    }
  });

  it("classifies BLS calls", () => {
    for (const ct of ["BLS", "SICK PERSON", "FALL"]) {
      const info = classifyCallType(ct);
      expect(info.category, ct).toBe("bls");
      expect(info.severity, ct).toBe(2);
    }
  });

  it("classifies generic EMS / medical calls", () => {
    for (const ct of ["EMS", "MEDICAL", "MEDICAL LOCAL"]) {
      expect(classifyCallType(ct).category, ct).toBe("ems");
    }
  });

  it("classifies rescues", () => {
    for (const ct of ["RESCUE", "ELEVATOR RESCUE", "LOCKOUT"]) {
      expect(classifyCallType(ct).category, ct).toBe("rescue");
    }
  });

  it("classifies technical rescues", () => {
    for (const ct of ["TECHNICAL RESCUE", "CONFINED SPACE", "TRENCH RESCUE", "COLLAPSE", "HIGH ANGLE RESCUE"]) {
      const info = classifyCallType(ct);
      expect(info.category, ct).toBe("technical_rescue");
      expect(info.severity, ct).toBe(4);
    }
  });

  it("classifies water rescues", () => {
    for (const ct of ["WATER RESCUE", "SWIFT WATER", "RIVER RESCUE", "DROWNING"]) {
      expect(classifyCallType(ct).category, ct).toBe("water_rescue");
    }
  });

  it("classifies hazmat", () => {
    for (const ct of ["HAZMAT", "HAZ-MAT", "GAS LEAK", "ODOR OF GAS", "CHEMICAL SPILL", "FUEL SPILL"]) {
      expect(classifyCallType(ct).category, ct).toBe("hazmat");
    }
  });

  it("classifies mass casualty incidents as major", () => {
    for (const ct of ["MASS CASUALTY", "MCI"]) {
      const info = classifyCallType(ct);
      expect(info.category, ct).toBe("mass_casualty");
      expect(info.severity, ct).toBe(5);
      expect(info.major, ct).toBe(true);
    }
  });

  it("classifies special operations as major", () => {
    for (const ct of ["SPECIAL OPERATIONS", "BOMB THREAT", "ACTIVE ASSAILANT"]) {
      const info = classifyCallType(ct);
      expect(info.category, ct).toBe("special_ops");
      expect(info.major, ct).toBe(true);
    }
  });

  it("classifies service calls", () => {
    for (const ct of ["SERVICE CALL", "ASSIST", "PUBLIC SERVICE", "WIRES DOWN", "TREE DOWN"]) {
      const info = classifyCallType(ct);
      expect(info.category, ct).toBe("service");
      expect(info.severity, ct).toBe(1);
    }
  });

  it("falls back to other with a readable label", () => {
    const info = classifyCallType("SOMETHING NOBODY EXPECTED");
    expect(info).toMatchObject({ category: "other", severity: 1, major: false });
    expect(info.label).toBe("Something Nobody Expected");
    expect(classifyCallType("").category).toBe("other");
    expect(classifyCallType("   ").label).toBe("Other");
  });

  it("is case-insensitive and tolerant of whitespace", () => {
    expect(classifyCallType("  house   fire ").category).toBe("structure_fire");
    expect(classifyCallType("pic").category).toBe("collision");
  });

  it("never files a fire under service, and ranks an unclassified fire above routine", () => {
    for (const ct of ["ELECTRICAL FIRE", "APPLIANCE FIRE"]) {
      const info = classifyCallType(ct);
      expect(info.category, ct).not.toBe("service");
      expect(info.severity, ct).toBeGreaterThanOrEqual(3);
    }
    expect(classifyCallType("ELECTRICAL PROBLEM").category).toBe("service");
  });

  it("treats motorcycle and bicycle accidents as collisions", () => {
    expect(classifyCallType("MOTORCYCLE ACCIDENT").category).toBe("collision");
    expect(classifyCallType("BICYCLE ACCIDENT").category).toBe("collision");
  });

  it("ranks a person locked in above a plain lockout", () => {
    expect(classifyCallType("LOCKOUT")).toMatchObject({ category: "rescue", severity: 1 });
    expect(classifyCallType("CHILD LOCKED IN VEHICLE")).toMatchObject({ category: "rescue", severity: 3 });
  });

  it("does not confuse a fire alarm with a structure fire", () => {
    expect(classifyCallType("FIRE ALARM").category).toBe("fire_alarm");
    expect(classifyCallType("HOUSE FIRE ALARM").category).toBe("fire_alarm");
  });

  it("gives every matched rule a label", () => {
    for (const ct of ["HOUSE FIRE", "PIC", "ALS", "HAZMAT", "SERVICE CALL"]) {
      expect(classifyCallType(ct).label.length, ct).toBeGreaterThan(0);
    }
    expect(classifyCallType("PIC").label).toBe("Personal Injury Collision");
  });

  describe("subtype escalation", () => {
    it("escalates a house fire to working fire", () => {
      const info = classifyCallType("HOUSE FIRE", "WORKING FIRE");
      expect(info).toMatchObject({ category: "working_fire", severity: 5, major: true });
    });

    it("escalates a collision to rescue on an entrapment subtype", () => {
      const info = classifyCallType("PIC", "ENTRAPMENT");
      expect(info).toMatchObject({ category: "rescue", severity: 4 });
    });

    it("does not de-escalate on a lower-severity subtype", () => {
      const info = classifyCallType("HOUSE FIRE", "SMOKE SHOWING");
      expect(info.category).toBe("structure_fire");
      expect(info.severity).toBe(4);
    });

    it("uses the subtype when the call type is unrecognized", () => {
      expect(classifyCallType("ZZZ", "GAS LEAK").category).toBe("hazmat");
      expect(classifyCallType("ZZZ", "SERVICE CALL").category).toBe("service");
    });

    it("ignores an empty subtype", () => {
      expect(classifyCallType("PIC", "").category).toBe("collision");
      expect(classifyCallType("PIC", undefined).category).toBe("collision");
    });
  });

  describe("rule table", () => {
    it("only uses known incident categories and valid severities", () => {
      for (const rule of CALL_TYPE_RULES) {
        expect(INCIDENT_CATEGORIES).toContain(rule.category);
        expect(rule.severity).toBeGreaterThanOrEqual(1);
        expect(rule.severity).toBeLessThanOrEqual(5);
        expect(rule.pattern.flags).toContain("i");
      }
    });

    it("accepts a custom rule table", () => {
      const rules: CallTypeRule[] = [{ pattern: /\bLLAMA\b/i, category: "special_ops", label: "Llama Loose", severity: 5, major: true }];
      expect(classifyCallType("LLAMA LOOSE", undefined, rules)).toMatchObject({ category: "special_ops", label: "Llama Loose", severity: 5, major: true });
      expect(classifyCallType("HOUSE FIRE", undefined, rules).category).toBe("other");
    });
  });
});
