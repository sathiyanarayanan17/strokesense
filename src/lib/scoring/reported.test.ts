import { describe, expect, it } from "vitest";
import { scoreReported } from "@/lib/scoring/reported";
import { assessRisk } from "@/lib/scoring/risk";

describe("scoreReported", () => {
  it("maps answers to findings", () => {
    expect(scoreReported("balance", "yes").finding).toBe("abnormal");
    expect(scoreReported("eyes", "no").finding).toBe("normal");
    expect(scoreReported("eyes", "unsure").finding).toBe("inconclusive");
  });

  it("a reported vision loss alone triggers the emergency tier", () => {
    expect(assessRisk([scoreReported("eyes", "yes")]).tier).toBe("emergency");
  });
});
