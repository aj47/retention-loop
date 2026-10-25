import { z } from "zod";
import { formatChannelForPrompt, formatLessonsForPrompt, getChannel, listLessons } from "@/lib/memory/lessons";
import { ARGON, gemini, structured } from "./model";

const TrendsSchema = z.object({
  trends: z.array(z.object({ topic: z.string(), whyNow: z.string(), sources: z.array(z.object({ title: z.string(), url: z.string() })).default([]) })),
  methods: z.array(z.object({ method: z.string(), why: z.string() })).default([]),
});

const IdeasSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().describe("Working YouTube title in the creator's voice"),
        hook: z.string().describe("The first spoken line, opening on proof"),
        whyNow: z.string().describe("The trend that makes this timely, citing the research"),
        fitsChannel: z.string().describe("Which channel lessons this applies and how"),
        method: z.string().describe("Format or production method to use"),
        sources: z.array(z.object({ title: z.string(), url: z.string() })),
      }),
    )
    .describe("Exactly 4 ideas, strongest first"),
});
export type VideoIdeas = z.infer<typeof IdeasSchema>;

/**
 * A Managed Agent (Antigravity on Gemini 4 Argon, with Google Search)
 * researches what is trending for this audience right now; Argon then turns
 * the trends into video ideas that apply the channel's own lessons.
 */
export async function scoutIdeas(stage: (s: string) => Promise<void>) {
  const [channel, lessons] = await Promise.all([getChannel(), listLessons()]);
  const ai = gemini();
  await stage("A Managed Agent is researching what's trending");
  let interaction = (await ai.interactions.create(
    {
      agent: "antigravity-preview-09-2026",
      agent_config: { type: "antigravity", model: ARGON },
      environment: "remote",
      background: true,
      input: `Research what is trending RIGHT NOW (the last two weeks) for this YouTube audience, using Google Search.

${formatChannelForPrompt(channel)}

Find: new releases, techniques, debates and tools people are excited or arguing about; and video formats or production methods currently getting traction for tech creators. Prefer primary sources (release notes, docs, posts) and cite them.

Reply with ONLY a JSON object:
{"trends": [{"topic": "...", "whyNow": "...", "sources": [{"title": "...", "url": "..."}]}], "methods": [{"method": "...", "why": "..."}]}
Give 6 trends and 3 methods.`,
    } as never,
    { timeout: 15 * 60 * 1000 },
  )) as { id: string; status: string; output_text?: string };
  while (!["completed", "failed", "cancelled", "incomplete"].includes(interaction.status)) {
    await new Promise((r) => setTimeout(r, 4000));
    interaction = (await ai.interactions.get(interaction.id)) as typeof interaction;
  }
  const json = interaction.output_text?.match(/\{[\s\S]*\}/)?.[0];
  if (interaction.status !== "completed" || !json) throw new Error(`Trend research ended with status ${interaction.status}`);
  const trends = TrendsSchema.parse(JSON.parse(json));

  await stage("Gemini 4 Argon is matching trends to your channel");
  const r = await structured({
    schema: IdeasSchema,
    system: "You are the AI Director for a YouTube creator. Propose videos that are timely AND apply what this channel's audience has shown it responds to. Never invent sources.",
    input: `<channel>\n${formatChannelForPrompt(channel)}\n</channel>\n\n<channel_lessons>\n${formatLessonsForPrompt(lessons.slice(0, 8))}\n</channel_lessons>\n\n<trend_research>\n${JSON.stringify(trends)}\n</trend_research>\n\nPropose exactly 4 video ideas.`,
    thinking: "medium",
  });
  return { ideas: r.data.ideas, trends: trends.trends, methods: trends.methods, model: r.model, researchInteraction: interaction.id };
}
