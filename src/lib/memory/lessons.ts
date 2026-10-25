import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { ChannelIdentity, EvidenceRef, EvidenceStrength, LessonScope, LessonStatus } from "@/lib/db/schema";
import { newId } from "@/lib/ids";

export type Lesson = typeof schema.lessons.$inferSelect;

export interface LessonInput {
  claim: string;
  scope?: LessonScope;
  evidence?: EvidenceRef[];
  counterexamples?: EvidenceRef[];
  status?: LessonStatus;
  applicability?: string;
  strength?: EvidenceStrength;
  suggestedUse?: string;
}

export async function listLessons(includeArchived = false): Promise<Lesson[]> {
  const d = await db();
  return d
    .select()
    .from(schema.lessons)
    .where(includeArchived ? undefined : eq(schema.lessons.archived, false))
    .orderBy(desc(schema.lessons.updatedAt));
}

export async function createLesson(input: LessonInput): Promise<Lesson> {
  const d = await db();
  const [row] = await d
    .insert(schema.lessons)
    .values({ id: newId("les"), ...input, claim: input.claim.trim() })
    .returning();
  return row;
}

export async function updateLesson(id: string, patch: Partial<LessonInput> & { archived?: boolean }): Promise<Lesson | undefined> {
  const d = await db();
  const [row] = await d
    .update(schema.lessons)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.lessons.id, id))
    .returning();
  return row;
}

const STATUS_WEIGHT: Record<LessonStatus, number> = {
  experimentally_supported: 1.5,
  observation: 1,
  hypothesis: 0.8,
  inconclusive: 0.5,
  outdated: 0,
};
const STRENGTH_WEIGHT: Record<EvidenceStrength, number> = { strong: 1.3, moderate: 1, weak: 0.8 };

/**
 * Retrieves a handful of lessons relevant to the current work. Full-text rank
 * is weighted by evidence status and strength, penalised by counterexamples,
 * and lessons scoped to a different format are excluded so, for example, a
 * long-form tutorial lesson is not applied to Shorts.
 */
export async function retrieveLessons(query: string, opts: { format?: string; limit?: number } = {}): Promise<Lesson[]> {
  const d = await db();
  const terms = query
    .toLowerCase()
    .match(/[a-z0-9]{3,}/g)
    ?.slice(0, 40)
    .join(" | ");
  const rank = terms ? sql<number>`ts_rank(search, to_tsquery('english', ${terms}))` : sql<number>`0`;
  const rows = await d
    .select({ lesson: schema.lessons, rank })
    .from(schema.lessons)
    .where(and(eq(schema.lessons.archived, false), sql`${schema.lessons.status} <> 'outdated'`))
    .orderBy(desc(rank))
    .limit(30);

  return rows
    .filter(({ lesson }) => {
      const formats = lesson.scope.formats ?? [];
      return !opts.format || !formats.length || formats.includes(opts.format);
    })
    .map(({ lesson, rank: r }) => {
      const penalty = 1 / (1 + 0.5 * lesson.counterexamples.length);
      const score = (Number(r) + 0.01) * STATUS_WEIGHT[lesson.status] * STRENGTH_WEIGHT[lesson.strength] * penalty;
      return { lesson, score };
    })
    .filter((x) => x.score > 0.011 || !terms)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 5)
    .map((x) => x.lesson);
}

export function formatLessonsForPrompt(lessons: Lesson[]): string {
  if (!lessons.length) return "No channel lessons are available. Do not invent channel history.";
  return lessons
    .map(
      (l) =>
        `- [${l.id}] (${l.status}, ${l.strength} evidence${l.counterexamples.length ? `, ${l.counterexamples.length} counterexample(s)` : ""}) ${l.claim}` +
        (l.applicability ? `\n  Applies when: ${l.applicability}` : ""),
    )
    .join("\n");
}

export async function getChannel(): Promise<{ name: string; identity: ChannelIdentity; connected: boolean } | null> {
  const d = await db();
  const [row] = await d.select().from(schema.channels).limit(1);
  return row ?? null;
}

export function formatChannelForPrompt(channel: Awaited<ReturnType<typeof getChannel>>): string {
  if (!channel) return "No channel profile has been set up. Treat this as unpersonalized creative help.";
  const i = channel.identity;
  const lines = [`Channel: ${channel.name}`];
  if (i.subject) lines.push(`Subject matter: ${i.subject}`);
  if (i.audience) lines.push(`Audience: ${i.audience}`);
  if (i.goals) lines.push(`Creator goals: ${i.goals}`);
  if (i.tone) lines.push(`Tone and style: ${i.tone}`);
  if (i.constraints) lines.push(`Production constraints: ${i.constraints}`);
  if (i.preferences?.length) lines.push(`Editorial preferences learned from past decisions: ${i.preferences.join("; ")}`);
  return lines.join("\n");
}
