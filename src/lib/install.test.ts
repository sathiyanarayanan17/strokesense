import { describe, expect, it } from "vitest";
import { isIos } from "@/lib/install";

describe("isIos", () => {
  it("recognises iPhone, iPad and iPadOS-as-Mac user agents", () => {
    expect(isIos("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")).toBe(true);
    expect(isIos("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(true);
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Mobile/15E148")).toBe(true);
  });
  it("is false for Android and desktop browsers", () => {
    expect(isIos("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile Safari/537.36")).toBe(false);
    expect(isIos("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36")).toBe(false);
  });
});
