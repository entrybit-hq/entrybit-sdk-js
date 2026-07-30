import { afterEach, describe, expect, it, vi } from "vitest";
import { backoffDelayMs } from "../src/core/backoff.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("backoffDelayMs", () => {
  it("is uniform in [exp/2, exp) for early attempts (equal jitter)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(backoffDelayMs(0)).toBe(250); // exp = 500
    expect(backoffDelayMs(1)).toBe(500); // exp = 1000
    expect(backoffDelayMs(2)).toBe(1000); // exp = 2000

    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    expect(backoffDelayMs(0)).toBeLessThan(500);
    expect(backoffDelayMs(0)).toBeGreaterThan(499);
  });

  it("caps the exponential term at 8 seconds for late attempts", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(backoffDelayMs(4)).toBe(4000); // exp = 8000 (500 * 2^4 = 8000, at the cap)
    expect(backoffDelayMs(10)).toBe(4000); // exp clamped to 8000

    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    expect(backoffDelayMs(10)).toBeLessThan(8000);
  });
});
