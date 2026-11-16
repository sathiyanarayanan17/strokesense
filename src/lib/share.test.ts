import { describe, expect, it } from "vitest";
import { DICTS, LANGS } from "@/lib/i18n";
import { mapsLink, smsUrl, whatsappUrl } from "@/lib/share";

describe("share helpers", () => {
  it("builds a maps link and rejects invalid coordinates", () => {
    expect(mapsLink(13.0827, 80.2707)).toBe("https://maps.google.com/?q=13.08270,80.27070");
    expect(mapsLink(NaN, 1)).toBeNull();
    expect(mapsLink(91, 0)).toBeNull();
    expect(mapsLink(0, 181)).toBeNull();
  });

  it("URL-encodes the whole message, including the report fragment", () => {
    const text = "Report: https://x.test/report#abc\nLocation: y";
    expect(whatsappUrl(text)).toBe(`https://wa.me/?text=${encodeURIComponent(text)}`);
    expect(smsUrl(text)).toContain("%23abc");
    expect(smsUrl(text)).not.toContain("\n");
  });
});

describe("share message and first aid text", () => {
  const p = { headline: "H", ago: "5 min ago", reportUrl: "https://x.test/report#a", mapUrl: "https://maps.google.com/?q=1,2" };

  it("includes the report link in every language, and omits optional parts when absent", () => {
    for (const { code } of LANGS) {
      const full = DICTS[code].shareMessage(p);
      expect(full).toContain(p.reportUrl);
      expect(full).toContain(p.mapUrl);
      expect(full).toContain(p.ago);
      const bare = DICTS[code].shareMessage({ ...p, ago: null, mapUrl: null });
      expect(bare).toContain(p.reportUrl);
      expect(bare).not.toContain("maps.google");
      expect(bare).not.toContain("null");
    }
  });

  it("has the same number of first-aid steps in every language, and never advises food, drink or aspirin", () => {
    const n = DICTS.en.firstAid.length;
    for (const { code } of LANGS) expect(DICTS[code].firstAid).toHaveLength(n);
    expect(DICTS.en.firstAid.join(" ")).toMatch(/Do not give food, drink or medicine/);
  });
});
