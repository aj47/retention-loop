import type { Brief, ShotPlan } from "@/lib/director/schemas";

export function briefToText(b: Brief): string {
  return [
    `# ${b.workingTitle}`,
    "",
    `**Premise:** ${b.premise}`,
    `**Intended viewer:** ${b.intendedViewer}`,
    `**Promise:** ${b.promise}`,
    `**Tone:** ${b.tone}`,
    "",
    "## Opening",
    b.opening,
    "",
    "## Outline",
    ...b.outline.map((o, i) => `${i + 1}. **${o.beat}** — ${o.purpose}`),
    ...(b.risks.length ? ["", "## Risks", ...b.risks.map((r) => `- ${r}`)] : []),
  ].join("\n");
}

export function shotPlanToText(p: ShotPlan): string {
  const total = p.shots.reduce((s, x) => s + x.estimatedSeconds, 0);
  return [
    `# Shot plan (~${Math.round(total / 60)} min)`,
    "",
    ...p.shots.flatMap((s, i) => [
      `## ${i + 1}. ${s.beat} (~${s.estimatedSeconds}s)`,
      `> ${s.scriptExcerpt.replace(/\n+/g, " ")}`,
      "",
      `- **Shot:** ${s.shot}`,
      ...(s.broll ? [`- **B-roll:** ${s.broll}`] : []),
      ...(s.onScreenText ? [`- **On-screen text:** ${s.onScreenText}`] : []),
      "",
    ]),
    "## Production checklist",
    ...p.checklist.map((c) => `- [ ] ${c}`),
  ].join("\n");
}
