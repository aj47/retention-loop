import { z } from "zod";
import { body, directorContext, route } from "@/lib/api";
import { rewriteSelection } from "@/lib/director";

export const POST = route(async (req) => {
  const input = await body(req, z.object({ script: z.string(), selection: z.string().min(1), action: z.string().min(1) }));
  const ctx = await directorContext(input.selection);
  return rewriteSelection(input, ctx);
});
