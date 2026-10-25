import { NextResponse } from "next/server";
import { z } from "zod";
import { DirectorError } from "@/lib/director/model";
import type { DirectorContext } from "@/lib/director";
import { formatChannelForPrompt, formatLessonsForPrompt, getChannel, retrieveLessons, type Lesson } from "@/lib/memory/lessons";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type RouteHandler<C> = (req: Request, ctx: C) => Promise<Response | unknown>;

/** Wraps a route handler: JSON-encodes results and maps known errors to status codes. */
export function route<C>(handler: RouteHandler<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const out = await handler(req, ctx);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request", issues: err.issues }, { status: 400 });
      if (err instanceof DirectorError) return NextResponse.json({ error: err.message }, { status: 502 });
      console.error(err);
      return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
    }
  };
}

export async function body<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  return schema.parse(await req.json().catch(() => ({})));
}

export function notFound(what = "Not found"): never {
  throw new HttpError(404, what);
}

/** Channel profile plus the few lessons relevant to `query`. */
export async function directorContext(query: string, format?: string): Promise<DirectorContext & { lessonList: Lesson[] }> {
  const [channel, lessonList] = await Promise.all([getChannel(), retrieveLessons(query, { format })]);
  return { channel: formatChannelForPrompt(channel), lessons: formatLessonsForPrompt(lessonList), lessonList };
}
