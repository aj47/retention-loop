import { route } from "@/lib/api";
import { whyCallouts } from "@/lib/director/panel";

/** Labeled "why viewers left here" callouts for a published video's retention chart. */
export const GET = route(async (req) => {
  const target = new URL(req.url).searchParams.get("target") ?? "";
  return { callouts: await whyCallouts(target) };
});
