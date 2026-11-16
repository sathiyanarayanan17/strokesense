import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, parsePrefs } from "@/lib/prefs";

describe("parsePrefs", () => {
  it("returns defaults for missing, corrupt or non-object data", () => {
    for (const bad of [null, undefined, 5, "x", [], true]) {
      expect(parsePrefs(bad)).toEqual(DEFAULT_PREFS);
    }
  });

  it("accepts valid values and ignores unknown or wrongly typed ones", () => {
    expect(parsePrefs({ large: true, contrast: true, voice: false, region: "US" })).toEqual({
      large: true,
      contrast: true,
      voice: false,
      region: "US",
    });
    expect(parsePrefs({ large: "yes", contrast: 1, voice: "no", region: "__proto__" })).toEqual(DEFAULT_PREFS);
    expect(parsePrefs({ region: "XX" }).region).toBeNull();
  });

  it("keeps voice guidance on unless it was explicitly turned off", () => {
    expect(parsePrefs({}).voice).toBe(true);
  });
});
