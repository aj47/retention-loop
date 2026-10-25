import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { listLessons } from "@/lib/memory/lessons";

export interface Opportunity {
  id: string;
  kind: "Continue working" | "Worth revisiting" | "Apply a lesson";
  title: string;
  why: string;
  evidence: string;
  effort: "Low" | "Medium" | "High";
  uncertainty: string;
  href: string;
  action: string;
}

const VIEW_FOR_STAGE = { idea: "angle", script: "script", rough_cut: "cut", published: "viewers" } as const;
const STAGE_LABEL = { idea: "Idea", script: "Script", rough_cut: "Rough cut", published: "Published" } as const;

/**
 * A short, ranked list of next actions drawn from the creator's projects,
 * findings, and lessons. Ordered by how directly each can be acted on.
 */
export async function buildOpportunities(): Promise<Opportunity[]> {
  const d = await db();
  const projects = await d.select().from(schema.projects).orderBy(desc(schema.projects.updatedAt)).limit(30);
  const declines = await d.select().from(schema.findings).where(eq(schema.findings.label, "observed")).orderBy(desc(schema.findings.createdAt));
  const assets = await d.select({ id: schema.sourceAssets.id, projectId: schema.sourceAssets.projectId }).from(schema.sourceAssets);
  const scripts = await d.select({ projectId: schema.artifacts.projectId }).from(schema.artifacts).where(eq(schema.artifacts.kind, "script"));
  const lessons = (await listLessons()).filter((l) => l.status !== "outdated" && l.status !== "inconclusive");

  const out: Opportunity[] = [];
  const active = projects.find((p) => p.stage !== "published");
  if (active) {
    out.push({
      id: `continue-${active.id}`,
      kind: "Continue working",
      title: `${active.title} — ${STAGE_LABEL[active.stage]}`,
      why: "Your most recently touched project.",
      evidence: "",
      effort: "Low",
      uncertainty: "",
      href: `/projects/${active.id}?view=${VIEW_FOR_STAGE[active.stage]}`,
      action: "Continue",
    });
  }

  const seen = new Set<string>();
  for (const f of declines) {
    if (seen.has(f.projectId) || !/faster|fall|declin|drop/i.test(f.title)) continue;
    seen.add(f.projectId);
    const p = projects.find((x) => x.id === f.projectId);
    if (!p) continue;
    const hasSource = assets.some((a) => a.projectId === p.id);
    out.push({
      id: `revisit-${p.id}`,
      kind: "Worth revisiting",
      title: hasSource ? `Preview a tighter recut of “${p.title}”` : `“${p.title}” loses viewers early — upload its source to preview a recut`,
      why: f.title,
      evidence: "Retention fell faster than expected in this interval.",
      effort: hasSource ? "Low" : "Medium",
      uncertainty: "Where viewers left is observed; why they left is a hypothesis.",
      href: `/projects/${p.id}?view=${hasSource ? "cut" : "viewers"}`,
      action: hasSource ? "Preview recut" : "Review findings",
    });
  }

  const target = projects.find((p) => p.stage === "script" || (p.stage === "idea" && scripts.some((s) => s.projectId === p.id)));
  for (const l of lessons.filter((x) => x.strength !== "weak").slice(0, 2)) {
    if (!target) break;
    out.push({
      id: `lesson-${l.id}-${target.id}`,
      kind: "Apply a lesson",
      title: `Apply “${l.claim}” to ${target.title}`,
      why: l.suggestedUse || l.applicability || "A lesson from your channel history.",
      evidence: `${l.evidence.length} supporting, ${l.counterexamples.length} contradicting`,
      effort: "Low",
      uncertainty: l.status === "experimentally_supported" ? "Supported by an experiment" : "Observational — not proven to cause better retention",
      href: `/projects/${target.id}?view=script`,
      action: "Open script",
    });
  }
  return out;
}
