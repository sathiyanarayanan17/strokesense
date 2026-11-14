import { describe, expect, it } from "vitest";
import { buildQuery, distanceKm, parseHospitals } from "@/lib/hospitals";

describe("distanceKm", () => {
  it("matches a known distance (Chennai Central to Chennai airport ≈ 15 km)", () => {
    expect(distanceKm(13.0827, 80.2707, 12.9941, 80.1709)).toBeGreaterThan(13);
    expect(distanceKm(13.0827, 80.2707, 12.9941, 80.1709)).toBeLessThan(16);
  });
});

describe("parseHospitals", () => {
  const json = {
    elements: [
      { type: "node", id: 1, lat: 13.1, lon: 80.28, tags: { name: "Far Hospital" } },
      { type: "way", id: 2, center: { lat: 13.083, lon: 80.271 }, tags: { name: "Near Hospital" } },
      { type: "node", id: 3, lat: 13.084, lon: 80.271, tags: { name: "near hospital" } }, // duplicate
      { type: "node", id: 4, lat: 13.2, lon: 80.3, tags: { name: "ER Hospital", emergency: "yes", phone: "+91 44 1234" } },
      { type: "node", id: 5, lat: 13.09, lon: 80.27, tags: {} }, // unnamed
    ],
  };

  it("dedupes, drops unnamed, and puts mapped emergency departments first", () => {
    const h = parseHospitals(json, 13.0827, 80.2707);
    expect(h.map((x) => x.name)).toEqual(["ER Hospital", "Near Hospital", "Far Hospital"]);
    expect(h[0].phone).toBe("+91 44 1234");
  });

  it("survives malformed responses", () => {
    expect(parseHospitals(null, 0, 0)).toEqual([]);
    expect(parseHospitals({ elements: "x" }, 0, 0)).toEqual([]);
  });
});

describe("buildQuery", () => {
  it("embeds only formatted numbers", () => {
    expect(buildQuery(13.08271234, 80.2707, 5000)).toContain("around:5000,13.08271,80.27070");
  });
});
