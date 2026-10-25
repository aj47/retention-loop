import { route } from "@/lib/api";
import { retryJob } from "@/lib/jobs/runner";

type Ctx = { params: Promise<{ jobId: string }> };

export const POST = route<Ctx>(async (_req, { params }) => {
  const { jobId } = await params;
  await retryJob(jobId);
  return { ok: true };
});
