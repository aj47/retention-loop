import { z } from "zod";
import { body, notFound, route } from "@/lib/api";
import { updateLesson } from "@/lib/memory/lessons";
import { LessonInput } from "@/lib/memory/input";

type Ctx = { params: Promise<{ lessonId: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { lessonId } = await params;
  const patch = await body(req, LessonInput.partial().extend({ archived: z.boolean().optional() }));
  return { lesson: (await updateLesson(lessonId, patch)) ?? notFound("Lesson not found") };
});
