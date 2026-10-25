import { describe, expect, it } from "vitest";
import { compileTimeline, outputToSource, sourceToOutput, type PlanOperation } from "@/lib/edit/timeline";

const op = (p: Partial<PlanOperation> & Pick<PlanOperation, "id" | "type">): PlanOperation => ({
  executability: "direct",
  enabled: true,
  sourceIn: null,
  sourceOut: null,
  targetAt: null,
  ...p,
});

describe("compileTimeline", () => {
  it("returns the full source when nothing is enabled", () => {
    const t = compileTimeline([op({ id: "a", type: "remove", sourceIn: 0, sourceOut: 10, enabled: false })], 60);
    expect(t.segments).toEqual([{ sourceIn: 0, sourceOut: 60, outputIn: 0, outputOut: 60 }]);
  });

  it("moves a demo to the front and shortens the intro", () => {
    const t = compileTimeline(
      [
        op({ id: "move", type: "move", sourceIn: 155, sourceOut: 178, targetAt: 0 }),
        op({ id: "trim", type: "trim", sourceIn: 20, sourceOut: 58 }),
      ],
      300,
    );
    expect(t.segments.map((s) => [s.sourceIn, s.sourceOut])).toEqual([
      [155, 178],
      [0, 20],
      [58, 155],
      [178, 300],
    ]);
    expect(t.duration).toBe(262);
    expect(sourceToOutput(t.segments, 160)).toBe(5);
    expect(outputToSource(t.segments, 26)).toBe(3);
    expect(sourceToOutput(t.segments, 30)).toBeNull();
  });

  it("tightens long pauses but leaves padding", () => {
    const t = compileTimeline([op({ id: "p", type: "tighten_pauses", sourceIn: 0, sourceOut: 30 })], 30, [
      { start: 10, end: 12 },
      { start: 20, end: 20.3 },
    ]);
    expect(t.segments.map((s) => [s.sourceIn, s.sourceOut])).toEqual([
      [0, 10.15],
      [11.85, 30],
    ]);
  });

  it("skips invalid and advisory operations with reasons", () => {
    const t = compileTimeline(
      [
        op({ id: "bad", type: "move", sourceIn: 10, sourceOut: 20, targetAt: 15 }),
        op({ id: "broll", type: "insert", executability: "suggested" }),
        op({ id: "oob", type: "remove", sourceIn: 50, sourceOut: 90 }),
      ],
      60,
    );
    expect(t.skipped.map((s) => s.id).sort()).toEqual(["bad", "broll", "oob"]);
    expect(t.appliedOperationIds).toEqual([]);
    expect(t.duration).toBe(60);
  });

  it("rejects overlapping moves", () => {
    const t = compileTimeline(
      [
        op({ id: "m1", type: "move", sourceIn: 30, sourceOut: 40, targetAt: 0 }),
        op({ id: "m2", type: "move", sourceIn: 35, sourceOut: 45, targetAt: 0 }),
      ],
      60,
    );
    expect(t.appliedOperationIds).toEqual(["m1"]);
    expect(t.skipped).toEqual([{ id: "m2", reason: "Overlaps another moved segment" }]);
  });
});
