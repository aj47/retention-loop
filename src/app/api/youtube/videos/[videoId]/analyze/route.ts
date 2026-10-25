import { eq } from "drizzle-orm";
import { HttpError, route } from "@/lib/api";
import { analyzeForProject } from "@/lib/analytics/project";
import { db, schema } from "@/lib/db";
import { videoPart } from "@/lib/director";
import { directorMode } from "@/lib/director/model";
import { createProject } from "@/lib/projects/service";
import { youtubeUrl } from "@/lib/youtube/client";

type Ctx = { params: Promise<{ videoId: string }> };

/** Opens (or reuses) a project for a published video and has Argon watch it against its retention curve. */
export const POST = route<Ctx>(async (_req, { params }) => {
  const { videoId } = await params;
  const d = await db();
  const [video] = await d.select().from(schema.youtubeVideos).where(eq(schema.youtubeVideos.id, videoId));
  if (!video?.curveId) throw new HttpError(404, "Sync this video's retention first");
  const [curve] = await d.select().from(schema.retentionCurves).where(eq(schema.retentionCurves.id, video.curveId));
  let [project] = await d.select().from(schema.projects).where(eq(schema.projects.youtubeVideoId, videoId));
  if (!project) {
    project = await createProject({ title: video.title, stage: "published" });
    await d.update(schema.projects).set({ youtubeVideoId: videoId }).where(eq(schema.projects.id, project.id));
  }
  await analyzeForProject({
    projectId: project.id,
    label: video.title,
    format: "long-form",
    durationSeconds: video.durationSeconds,
    points: curve.points,
    source: "youtube",
    youtubeVideoId: videoId,
    video: directorMode() === "gemini" ? videoPart(youtubeUrl(videoId)) : undefined,
  });
  return { projectId: project.id, redirect: `/projects/${project.id}?view=viewers` };
});
