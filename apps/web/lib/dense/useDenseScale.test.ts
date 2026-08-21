import { describe, expect, it } from "vitest";

import { AUTO_MAX_SCALE, computeAutoScale, MIN_SCALE } from "./useDenseScale";

describe("computeAutoScale", () => {
  it("is 1 at the design's own frame size", () => {
    expect(computeAutoScale(1000, 625)).toBe(1);
  });

  it("follows the more constrained axis so the 16:10 framing survives", () => {
    // Very wide but short: height is the limit, not width.
    expect(computeAutoScale(4000, 625)).toBe(1);
  });

  it("clamps below MIN_SCALE on small viewports", () => {
    expect(computeAutoScale(320, 480)).toBe(MIN_SCALE);
  });

  it("never scales up past AUTO_MAX_SCALE automatically, even on a huge monitor", () => {
    // A real 2560x1440 display used to compute 2.304 here — every control,
    // not just text, rendered at 2.3x its designed size. Auto-fit now caps
    // at AUTO_MAX_SCALE (1.3x) on a big monitor; scaling up further is a
    // manual choice via the header's Scale control, not something a big
    // monitor should do by itself.
    expect(computeAutoScale(8000, 5000)).toBe(AUTO_MAX_SCALE);
    expect(computeAutoScale(2560, 1440)).toBe(AUTO_MAX_SCALE);
  });
});
