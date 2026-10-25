import { z } from "zod";
import { body, route } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { getChannel } from "@/lib/memory/lessons";

const Input = z.object({
  name: z.string().min(1),
  identity: z.object({
    subject: z.string().optional(),
    audience: z.string().optional(),
    goals: z.string().optional(),
    tone: z.string().optional(),
    constraints: z.string().optional(),
    preferences: z.array(z.string()).optional(),
  }),
});

export const GET = route(async () => ({ channel: await getChannel() }));

export const PUT = route(async (req) => {
  const input = await body(req, Input);
  const d = await db();
  const [existing] = await d.select().from(schema.channels).limit(1);
  if (existing) await d.update(schema.channels).set(input);
  else await d.insert(schema.channels).values({ id: newId("chn"), ...input });
  return { channel: await getChannel() };
});
