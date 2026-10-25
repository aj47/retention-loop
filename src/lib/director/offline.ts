// Deterministic stand-ins for the AI Director, used when no Gemini
// credentials are configured. They apply simple, transparent editorial rules
// so the product stays usable; the UI labels their output as offline.
import type { TimeRange, Transcript } from "@/lib/db/schema";
import type { RetentionAnomaly } from "@/lib/analytics/retention";
import { joinParagraphs, splitParagraphs } from "@/lib/script/diff";
import type { Brief, Direction, Directions, Draft, EditProposal, Rewrite, ShotPlan, ViewerRead } from "./schemas";
import type { Treatment } from "./index";

const topicOf = (idea: string) =>
  idea
    .replace(/^(i (want|would like|plan|am planning) to|let'?s|make a video (about|on)|a video (about|on))\s+/i, "")
    .replace(/[.?!]+$/, "")
    .trim() || "this idea";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function directions(idea: string, push?: string): Directions {
  const topic = topicOf(idea);
  const base: Direction[] = [
    {
      title: "The Real-World Test",
      premise: `${cap(topic)}, done for real on camera, with a clear verdict at the end.`,
      intendedViewer: "Practitioners deciding whether this is worth their time",
      promise: "You will see exactly what happens when this meets a real task.",
      opening: `I put this to a real test: ${topic}. Here's the moment it went right — and the moment it didn't.`,
      narrative: "Open on the result, rewind to the setup, run the test, then compare outcomes against a clear scorecard.",
      whyInteresting: "Concrete stakes and a visible outcome give viewers a reason to stay to the verdict.",
      mode: "optimize",
      lessonIds: [],
    },
    {
      title: "The Surprise Failure",
      premise: `What goes wrong with ${topic} when nobody checks the details.`,
      intendedViewer: "Viewers who already know the basics and want the gotchas",
      promise: "You'll learn the failure mode before it costs you.",
      opening: `This almost worked. Then I looked closer.`,
      narrative: "Start with an apparent success, reveal the hidden flaw, investigate why, and end with how to catch it.",
      whyInteresting: "A reversal creates curiosity that a straightforward walkthrough lacks.",
      mode: "explore",
      lessonIds: [],
    },
    {
      title: "The Practical Decision Guide",
      premise: `Which option should you actually choose for ${topic}, and when?`,
      intendedViewer: "People actively choosing between options",
      promise: "A clear recommendation for your situation in under ten minutes.",
      opening: `If you only remember one thing about ${topic}, make it this.`,
      narrative: "Lead with the recommendation, then walk through the deciding factors with short demonstrations of each.",
      whyInteresting: "Answers the viewer's real question directly and stays useful as a reference.",
      mode: "optimize",
      lessonIds: [],
    },
  ];
  if (push) base.forEach((d) => (d.whyInteresting += ` (Pushed to be ${push}.)`));
  return {
    directions: base,
    channelNote: "Offline mode: these are generic editorial patterns, not informed by your channel history.",
  };
}

export function brief(idea: string, picked: Direction[]): Brief {
  const d = picked[0] ?? directions(idea).directions[0];
  return {
    workingTitle: picked.map((p) => p.title).join(" × ") || d.title,
    premise: d.premise,
    intendedViewer: d.intendedViewer,
    promise: d.promise,
    opening: d.opening,
    outline: [
      { beat: "Hook", purpose: "Show the most compelling moment first" },
      { beat: "Setup", purpose: "Only the context needed to follow the challenge" },
      { beat: "Challenge", purpose: "Define what success looks like" },
      { beat: "Demonstration", purpose: "Do it on camera" },
      { beat: "Comparison", purpose: "Judge the results against the promise" },
      { beat: "Payoff", purpose: "Deliver the verdict and what to do next" },
    ],
    tone: "Direct and hands-on",
    risks: ["The opening must be backed by real footage of the outcome."],
  };
}

export function draft(briefText: string): Draft {
  const opening = briefText.match(/## Opening\n([^\n]+)/)?.[1] ?? "";
  const beats = [...briefText.matchAll(/^\d+\. \*\*(.+?)\*\* — (.+)$/gm)].map((m) => `[${m[1]}] ${m[2]}.`);
  return {
    script: [opening, ...beats].filter(Boolean).join("\n\n"),
    notes: "Offline mode: a beat-by-beat skeleton from the brief. Fill in each bracketed beat in your own words.",
    recordingTips: [],
  };
}

const FILLER = [
  /\b(so,?\s+)?(today|in this video),?\s+(we'?re|we are|i'?m|i am) (going to|gonna) (look at|talk about|be looking at|cover)\b/gi,
  /\bbasically,?\s*/gi,
  /\bjust\s+(?=to |a |the )/gi,
  /\bkind of\s+/gi,
  /\bas you (can|may) (see|know),?\s*/gi,
  /\b(without further ado|let'?s (just )?(get|dive) (into it|right in|started)),?\.?\s*/gi,
];

const PAYOFF = /\b(result|finished|won|winner|failed|mistake|broke|turns out|found|surpris|faster|slower|minutes?|seconds?|\d+%|\d+x)\b/i;
const SETUP = /\b(first,? let me|let me explain|before we (start|begin)|how (it|they) works?|i'?ve configured|set ?up|install)\b/i;

function tighten(p: string): string {
  let out = p;
  for (const f of FILLER) out = out.replace(f, "");
  out = out.replace(/\s{2,}/g, " ").replace(/\s+([,.])/g, "$1").trim();
  return out ? cap(out) : p;
}

export function rewrite(script: string, treatment: Treatment, locked: string[]): Rewrite {
  const lockedSet = new Set(locked.map((l) => l.trim()));
  let paras = splitParagraphs(script);
  const changes: Rewrite["changes"] = [];
  const diagnostics: Rewrite["diagnostics"] = [];

  const setupIdx = paras.findIndex((p) => SETUP.test(p));
  const payoffIdx = paras.findIndex((p, i) => i > 0 && PAYOFF.test(p));
  if (setupIdx === 0) diagnostics.push({ aspect: "setup_length", observation: "The script opens with setup before the viewer knows what is at stake." });
  if (payoffIdx > 1) diagnostics.push({ aspect: "payoff", observation: `The first concrete result appears in paragraph ${payoffIdx + 1}.` });

  if ((treatment === "payoff_first" || treatment === "challenge" || treatment === "curiosity") && payoffIdx > 0 && !lockedSet.has(paras[payoffIdx])) {
    const [moved] = paras.splice(payoffIdx, 1);
    const lead =
      treatment === "curiosity"
        ? `Here's what I didn't expect. ${moved}`
        : treatment === "challenge"
          ? `One task, real stakes. ${moved}`
          : moved;
    paras.unshift(lead);
    changes.push({ purpose: "Moves the first concrete result into the opening so the viewer knows what they are watching for.", excerpt: lead.slice(0, 120), lessonIds: [] });
  }

  paras = paras.map((p) => {
    if (lockedSet.has(p)) return p;
    const t = tighten(p);
    return t;
  });
  if (paras.join() !== splitParagraphs(script).join()) {
    changes.push({ purpose: "Removes filler phrases and announcements that delay the content.", excerpt: "", lessonIds: [] });
  }

  return {
    proposed: joinParagraphs(paras),
    summary: "Offline heuristic revision: rules-based tightening and reordering. Add a Gemini API key for full rewrites.",
    changes,
    beats: paras.map((p, i) => ({ name: i === 0 ? "Hook" : `Beat ${i + 1}`, summary: p.split(/(?<=[.!?])\s/)[0].slice(0, 90) })),
    diagnostics,
  };
}

export function selection(text: string, action: string): { alternatives: string[] } {
  const tight = tighten(text);
  const sentences = text.split(/(?<=[.!?])\s+/);
  const options = [
      tight,
      sentences.length > 1 ? [sentences.at(-1), ...sentences.slice(0, -1)].join(" ") : tight,
      action.toLowerCase().includes("suspense") ? `${tight.replace(/\.$/, "")}… but that's not the whole story.` : tight.split(/,\s*/)[0] + ".",
  ];
  return { alternatives: [...new Set(options)] };
}

export function shotPlan(script: string): ShotPlan {
  const paras = splitParagraphs(script);
  return {
    shots: paras.map((p, i) => {
      const words = p.split(/\s+/).length;
      const demo = /\b(demo|show|screen|run|code|watch|look)\b/i.test(p);
      return {
        beat: i === 0 ? "Hook" : `Beat ${i + 1}`,
        scriptExcerpt: p,
        shot: demo ? "Screen recording of the action described" : "Talking head, medium shot",
        broll: demo ? "" : "Cutaway supporting the point",
        onScreenText: i === 0 ? p.split(/(?<=[.!?])\s/)[0].slice(0, 60) : "",
        estimatedSeconds: Math.max(4, Math.round((words / 150) * 60) + (demo ? 10 : 0)),
      };
    }),
    checklist: ["Record the outcome footage used in the hook", "Capture screen recordings at final resolution", "Room tone for audio continuity"],
  };
}

export function editProposal(transcript: Transcript | null, silences: TimeRange[], duration: number): EditProposal {
  const ops: EditProposal["operations"] = [];
  const longPauses = silences.filter((s) => s.end - s.start >= 0.6);
  if (longPauses.length) {
    ops.push({
      type: "tighten_pauses",
      title: `Tighten ${longPauses.length} long pause${longPauses.length > 1 ? "s" : ""}`,
      rationale: "Shortens silences longer than 0.6s while keeping a little breathing room on each side.",
      sourceIn: 0,
      sourceOut: duration,
      targetAt: null,
      requiredAssets: [],
      lessonIds: [],
    });
  }
  const segs = transcript?.segments ?? [];
  const setupEnd = segs.filter((s) => s.start < duration * 0.25 && SETUP.test(s.text)).at(-1)?.end;
  const firstSetup = segs.find((s) => s.start < duration * 0.25 && SETUP.test(s.text));
  if (firstSetup && setupEnd && setupEnd - firstSetup.start > 4) {
    ops.push({
      type: "trim",
      title: "Shorten introductory setup",
      rationale: "The setup explains configuration before the viewer knows what is at stake.",
      sourceIn: firstSetup.start,
      sourceOut: setupEnd,
      targetAt: null,
      requiredAssets: [],
      lessonIds: [],
    });
  }
  const payoff = segs.find((s) => s.start > duration * 0.2 && PAYOFF.test(s.text));
  if (payoff) {
    const end = segs.find((s) => s.start >= payoff.start && s.end - payoff.start >= 8)?.end ?? Math.min(duration, payoff.end + 8);
    ops.push({
      type: "move",
      title: "Move the first result earlier",
      rationale: "Opens with a concrete outcome so the viewer knows what they are watching for.",
      sourceIn: payoff.start,
      sourceOut: Math.min(end, payoff.start + 30),
      targetAt: 0,
      requiredAssets: [],
      lessonIds: [],
    });
  }
  ops.push({
    type: "overlay_text",
    title: "Add on-screen context to the new opening",
    rationale: "A short title card helps a cold open make sense.",
    sourceIn: 0,
    sourceOut: Math.min(4, duration),
    targetAt: null,
    requiredAssets: ["Title text and styling"],
    lessonIds: [],
  });
  return {
    treatment: payoff ? "Payoff-first opening" : "Tighter pacing",
    summary: transcript
      ? "Offline heuristic edit plan from transcript keywords and detected pauses."
      : "Offline edit plan from detected pauses only; no transcript was available.",
    operations: ops,
    observations: [],
    continuity: [],
  };
}

export function viewerRead(anomalies: RetentionAnomaly[], transcript: Transcript | null): ViewerRead {
  return {
    findings: anomalies.map((a, i) => {
      const said = transcript?.segments.find((s) => s.end >= a.contextStartSeconds && s.start <= a.endSeconds)?.text.trim();
      return {
        anomalyIndex: i,
        observed:
          a.direction === "steeper_decline"
            ? `Retention falls faster than expected between ${a.startSeconds}s and ${a.endSeconds}s.`
            : `Retention holds better than expected between ${a.startSeconds}s and ${a.endSeconds}s.`,
        hypotheses:
          a.direction === "steeper_decline"
            ? ["Setup runs long before the payoff", "The explanation gets more technical than the audience expects", "Viewers already got the answer they came for", "The content no longer matches the title's promise"]
            : ["A demonstration or reveal holds attention", "Viewers rewatch a dense or important section"],
        historical: "",
        nextAction: said ? `Review the passage starting “${said.slice(0, 80)}”.` : "Review the footage in the context window before this interval.",
      };
    }),
    proposedLessons: [],
  };
}
