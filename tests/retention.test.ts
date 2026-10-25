import { describe, expect, it } from "vitest";
import { analyzeRetention, changePoints, parseRetentionCsv } from "@/lib/analytics/retention";

const curve = (fn: (x: number) => number) =>
  Array.from({ length: 101 }, (_, i) => ({ ratio: i / 100, watchRatio: fn(i / 100) }));

describe("analyzeRetention", () => {
  it("finds no anomalies on a clean decay", () => {
    const a = analyzeRetention(curve((x) => 0.55 * Math.exp(-2 * x) + 0.3), { durationSeconds: 600 });
    expect(a.anomalies).toEqual([]);
    expect(a.baselineSource).toBe("fitted_decay");
    expect(a.resolutionSeconds).toBe(6);
  });

  it("flags a sharp drop and offers an earlier context window", () => {
    const pts = curve((x) => 0.55 * Math.exp(-2 * x) + 0.3 - (x >= 0.3 ? 0.12 : 0));
    const a = analyzeRetention(pts, { durationSeconds: 600 });
    const drop = a.anomalies.find((x) => x.direction === "steeper_decline" && x.startRatio <= 0.32 && x.endRatio >= 0.28);
    expect(drop).toBeDefined();
    expect(drop!.contextStartSeconds).toBeLessThan(drop!.startSeconds);
  });

  it("localizes a step drop against comparables instead of flagging the rest of the video", () => {
    const base = curve((x) => 0.55 * Math.exp(-2 * x) + 0.3);
    const dropped = curve((x) => 0.55 * Math.exp(-2 * x) + 0.3 - (x >= 0.3 ? 0.12 : 0));
    const a = analyzeRetention(dropped, { durationSeconds: 600, comparables: [base, base, base] });
    expect(a.anomalies).toHaveLength(1);
    const [drop] = a.anomalies;
    expect(drop.direction).toBe("steeper_decline");
    expect(drop.endRatio - drop.startRatio).toBeLessThan(0.1);
    expect(drop.residual).toBeLessThan(-0.08);
  });

  it("reports gradual divergence when there is no sharp bend", () => {
    const base = curve((x) => 0.55 * Math.exp(-2 * x) + 0.3);
    const sagging = curve((x) => 0.55 * Math.exp(-2 * x) + 0.3 - Math.max(0, x - 0.5) * 0.3);
    const a = analyzeRetention(sagging, { durationSeconds: 600, comparables: [base, base, base] });
    expect(a.anomalies.length).toBeGreaterThan(0);
    expect(a.anomalies[0].direction).toBe("steeper_decline");
    expect(a.anomalies[0].detectors).toEqual(["residual"]);
  });

  it("uses comparable curves as the baseline when there are enough", () => {
    const base = curve((x) => 0.5 * Math.exp(-2 * x) + 0.3);
    const a = analyzeRetention(base, { durationSeconds: 300, comparables: [base, base, base] });
    expect(a.baselineSource).toBe("comparable_median");
  });
});

describe("changePoints", () => {
  it("detects a slope change", () => {
    const xs = Array.from({ length: 60 }, (_, i) => (i < 30 ? 1 - i * 0.002 : 0.94 - (i - 30) * 0.02));
    const cps = changePoints(xs);
    expect(cps.some((c) => Math.abs(c - 30) <= 2)).toBe(true);
  });
});

describe("parseRetentionCsv", () => {
  it("reads YouTube API style columns", () => {
    const pts = parseRetentionCsv("elapsedVideoTimeRatio,audienceWatchRatio,relativeRetentionPerformance\n0.01,1.02,0.5\n0.02,0.9,0.48");
    expect(pts).toEqual([
      { ratio: 0.01, watchRatio: 1.02, relativePerformance: 0.5 },
      { ratio: 0.02, watchRatio: 0.9, relativePerformance: 0.48 },
    ]);
  });

  it("converts percent and timestamp positions", () => {
    expect(parseRetentionCsv("Video position (%),Audience retention (%)\n0,100\n50,40")[1]).toEqual({ ratio: 0.5, watchRatio: 0.4 });
    expect(parseRetentionCsv("time,retention\n0:00,1\n1:00,0.5", 120)[1]).toEqual({ ratio: 0.5, watchRatio: 0.5 });
  });
});
