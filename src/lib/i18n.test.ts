import { describe, expect, it } from "vitest";
import { DICTS, explainResult, LANGS } from "@/lib/i18n";

describe("i18n", () => {
  it("every language defines every key that English has", () => {
    const keys = (o: object): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((s) => `${k}.${s}`) : [k]));
    const en = keys(DICTS.en).sort();
    for (const { code } of LANGS) expect(keys(DICTS[code]).sort()).toEqual(en);
  });

  it("explains a weaker side in each language", () => {
    const r = { test: "face", finding: "abnormal", weakerSide: "left" } as const;
    expect(explainResult(r, "en")).toContain("left");
    expect(explainResult(r, "hi")).toContain("बायां");
    expect(explainResult(r, "ta")).toContain("இடது");
  });

  it("uses generic text for normal and inconclusive findings", () => {
    expect(explainResult({ test: "arm", finding: "normal" }, "en")).toBe(DICTS.en.normal);
    expect(explainResult({ test: "speech", finding: "inconclusive" }, "ta")).toBe(DICTS.ta.inconclusive);
  });
});
