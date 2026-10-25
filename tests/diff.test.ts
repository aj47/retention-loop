import { describe, expect, it } from "vitest";
import { changeIds, diffScripts, lockViolations, mergeScript } from "@/lib/script/diff";

const original = "Today we look at two tools.\n\nFirst, my setup.\n\nThen the demo.";
const proposed = "I gave both tools the same task.\n\nFirst, my setup.\n\nThe demo, and the mistake I almost shipped.";

describe("diffScripts", () => {
  it("groups changed paragraphs into hunks and keeps shared ones", () => {
    const blocks = diffScripts(original, proposed);
    expect(blocks.map((b) => b.kind)).toEqual(["change", "same", "change"]);
    expect(changeIds(blocks)).toEqual(["h1", "h2"]);
  });

  it("merges only accepted hunks", () => {
    const blocks = diffScripts(original, proposed);
    expect(mergeScript(blocks, ["h1"])).toBe("I gave both tools the same task.\n\nFirst, my setup.\n\nThen the demo.");
    expect(mergeScript(blocks, [])).toBe(original);
    expect(mergeScript(blocks, ["h1", "h2"])).toBe(proposed);
  });

  it("refuses hunks that would remove a locked passage", () => {
    const blocks = diffScripts(original, proposed, ["Then the demo."]);
    const h2 = blocks.find((b) => b.kind === "change" && b.id === "h2");
    expect(h2 && h2.kind === "change" && h2.touchesLocked).toBe(true);
    expect(mergeScript(blocks, ["h1", "h2"])).toContain("Then the demo.");
    expect(lockViolations(proposed, ["Then the demo."])).toEqual(["Then the demo."]);
  });
});

describe("moved paragraphs", () => {
  const before = "Intro and setup.\n\nThe middle part.\n\nThe result: one finished in eight minutes.";
  const after = "The result: one finished in eight minutes.\n\nIntro and setup.\n\nThe middle part.";

  it("links the two halves of a move", () => {
    const blocks = diffScripts(before, after);
    const hunks = blocks.filter((b) => b.kind === "change");
    expect(hunks.length).toBe(2);
    expect(hunks.every((h) => h.kind === "change" && h.linked.length === 1)).toBe(true);
  });

  it("never duplicates or drops a moved paragraph", () => {
    const blocks = diffScripts(before, after);
    expect(mergeScript(blocks, ["h1"])).toBe(before);
    expect(mergeScript(blocks, ["h2"])).toBe(before);
    expect(mergeScript(blocks, ["h1", "h2"])).toBe(after);
  });
});
