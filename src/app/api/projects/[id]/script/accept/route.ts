import { z } from "zod";
import { body, HttpError, route } from "@/lib/api";
import { addVersion, getOrCreateArtifact, getVersion, recordFeedback } from "@/lib/projects/service";
import { changeIds, diffScripts, mergeScript } from "@/lib/script/diff";

type Ctx = { params: Promise<{ id: string }> };

const Input = z.object({
  baseVersionId: z.string(),
  proposalVersionId: z.string(),
  acceptedHunks: z.array(z.string()),
  locked: z.array(z.string()).default([]),
});

/** Merges the accepted hunks of a proposal into the base script as a new current version. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const input = await body(req, Input);
  const [base, proposal] = await Promise.all([getVersion(input.baseVersionId), getVersion(input.proposalVersionId)]);
  if (!base || !proposal) throw new HttpError(404, "Version not found");

  const blocks = diffScripts(base.content, proposal.content, input.locked);
  const all = changeIds(blocks);
  const accepted = all.filter((h) => input.acceptedHunks.includes(h));
  const merged = mergeScript(blocks, accepted);
  const artifact = await getOrCreateArtifact(id, "script", "Script");
  const label = accepted.length === all.length ? `Accepted “${proposal.label.replace(/^Alternative — /, "")}”` : `Merged ${accepted.length}/${all.length} changes`;
  const version = await addVersion(artifact, { origin: "merge", label, content: merged, data: { from: proposal.id, acceptedHunks: accepted } });

  for (const h of all) {
    await recordFeedback({ projectId: id, targetType: "script_hunk", targetId: `${proposal.id}#${h}`, decision: accepted.includes(h) ? "accepted" : "rejected" });
  }
  return { version };
});
