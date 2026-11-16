import { describe, expect, it } from "vitest";
import { DEFAULT_REGION, detectRegion, isRegionKey, numbersFor, regionForCountry, REGIONS } from "@/lib/emergency";

describe("emergency numbers", () => {
  it("detects the region from the locale", () => {
    expect(detectRegion("en-GB", "Europe/London")).toBe("GB");
    expect(detectRegion("en-US", "America/New_York")).toBe("US");
    expect(detectRegion("de-DE", "Europe/Berlin")).toBe("EU");
    expect(detectRegion("en", "Europe/London")).toBeNull();
    expect(detectRegion(undefined, undefined)).toBeNull();
  });

  it("an Indian time zone beats an en-US phone language, so Indian users never get 911", () => {
    expect(detectRegion("en-US", "Asia/Kolkata")).toBe("IN");
    expect(detectRegion("en-GB", "Asia/Calcutta")).toBe("IN");
  });

  it("falls back to India for unknown regions and keeps 112 available there", () => {
    expect(numbersFor(null)).toEqual(REGIONS[DEFAULT_REGION].numbers);
    expect(numbersFor("XX")).toContain("112");
    expect(numbersFor("US")).toEqual(["911"]);
    expect(numbersFor("IN")[0]).toBe("108");
  });

  it("maps EU member states to the shared 112 entry and rejects unknown codes", () => {
    expect(regionForCountry("fr")).toBe("EU");
    expect(regionForCountry("ZZ")).toBeNull();
    expect(isRegionKey("EU")).toBe(true);
    expect(isRegionKey("constructor")).toBe(false);
  });

  it("every number is digits only, so it is safe in a tel: link", () => {
    for (const r of Object.values(REGIONS)) for (const n of r.numbers) expect(n).toMatch(/^\d{3,5}$/);
  });
});
