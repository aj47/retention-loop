import { body, route } from "@/lib/api";
import { LessonInput } from "@/lib/memory/input";
import { createLesson, listLessons } from "@/lib/memory/lessons";

export const GET = route(async () => ({ lessons: await listLessons(true) }));

export const POST = route(async (req) => ({ lesson: await createLesson(await body(req, LessonInput)) }));
