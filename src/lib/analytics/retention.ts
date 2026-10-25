import type { RetentionPoint } from "@/lib/db/schema";

/** Smallest deviations worth reporting, in watch-ratio units, regardless of how noise-free a curve is. */
const MIN_RESIDUAL = 0.02;
const MIN_SLOPE = 0.015;
/** Seconds of footage before a flagged interval worth reviewing. */
const CONTEXT_BEFORE = 15;

export type AnomalyDirection = "steeper_decline" | "stronger_hold";

export interface RetentionAnomaly {
  direction: AnomalyDirection;
  /** Elapsed-video ratio bounds of the flagged interval. */
  startRatio: number;
  endRatio: number;
  startSeconds: number;
  endSeconds: number;
  /** Earlier window worth inspecting: viewer departure can trail its cause. */
  contextStartSeconds: number;
  contextEndSeconds: number;
  /** Gap from the expected curve just after the event (watch-ratio units). */
  residual: number;
  /** Detectors that flagged this interval. They share input data, so agreement is not independent confirmation. */
  detectors: ("residual" | "slope" | "change_point")[];
}

export interface RetentionAnalysis {
  smoothed: number[];
  expected: number[];
  residuals: number[];
  ratios: number[];
  baselineSource: "comparable_median" | "fitted_decay";
  /** Seconds between adjacent reported positions; finer claims are not supported by the data. */
  resolutionSeconds: number;
  anomalies: RetentionAnomaly[];
  openingRetention: number | null;
  limitations: string[];
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function rollingMedian(xs: number[], window: number): number[] {
  const h = Math.floor(window / 2);
  return xs.map((_, i) => median(xs.slice(Math.max(0, i - h), Math.min(xs.length, i + h + 1))));
}

export function movingAverage(xs: number[], window: number): number[] {
  const h = Math.floor(window / 2);
  return xs.map((_, i) => {
    const w = xs.slice(Math.max(0, i - h), Math.min(xs.length, i + h + 1));
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
}

/** Robust smoothing: a rolling median suppresses spikes, a short mean removes stair-steps. */
export function smooth(xs: number[]): number[] {
  return movingAverage(rollingMedian(xs, 5), 3);
}

/**
 * Fits w(x) = a·e^(−b·x) + c by grid search over b with least squares for
 * a and c. The opening few points are excluded because initial drop-off
 * behaves differently from steady decay.
 */
export function fitDecay(ratios: number[], values: number[]): (x: number) => number {
  const idx = ratios.map((r, i) => i).filter((i) => ratios[i] >= 0.03);
  let best = { sse: Number.POSITIVE_INFINITY, a: 0, b: 0, c: median(values) };
  for (let b = 0.05; b <= 12; b *= 1.12) {
    const e = idx.map((i) => Math.exp(-b * ratios[i]));
    const y = idx.map((i) => values[i]);
    const n = idx.length;
    const se = e.reduce((s, v) => s + v, 0);
    const sy = y.reduce((s, v) => s + v, 0);
    const see = e.reduce((s, v) => s + v * v, 0);
    const sey = e.reduce((s, v, k) => s + v * y[k], 0);
    const det = n * see - se * se;
    if (Math.abs(det) < 1e-12) continue;
    const a = (n * sey - se * sy) / det;
    const c = (sy - a * se) / n;
    const sse = e.reduce((s, v, k) => s + (a * v + c - y[k]) ** 2, 0);
    if (sse < best.sse) best = { sse, a, b, c };
  }
  return (x) => best.a * Math.exp(-best.b * x) + best.c;
}

/** Median absolute deviation scaled to be comparable with a standard deviation. */
function mad(xs: number[]): number {
  const m = median(xs);
  return 1.4826 * median(xs.map((x) => Math.abs(x - m))) || 1e-6;
}

/**
 * Binary segmentation on the first difference: returns indices where the
 * mean slope shifts by more than the penalty allows.
 */
export function changePoints(xs: number[], minSize = 4, penalty = 3): number[] {
  const diffs = xs.slice(1).map((x, i) => x - xs[i]);
  const scale = mad(diffs);
  const cost = (seg: number[]) => {
    const m = seg.reduce((a, b) => a + b, 0) / (seg.length || 1);
    return seg.reduce((s, v) => s + ((v - m) / scale) ** 2, 0);
  };
  const found: number[] = [];
  const split = (lo: number, hi: number) => {
    if (hi - lo < 2 * minSize) return;
    const whole = cost(diffs.slice(lo, hi));
    let bestGain = 0;
    let bestK = -1;
    for (let k = lo + minSize; k <= hi - minSize; k++) {
      const gain = whole - cost(diffs.slice(lo, k)) - cost(diffs.slice(k, hi));
      if (gain > bestGain) {
        bestGain = gain;
        bestK = k;
      }
    }
    if (bestK < 0 || bestGain < penalty * Math.log(diffs.length)) return;
    found.push(bestK + 1);
    split(lo, bestK);
    split(bestK, hi);
  };
  split(0, diffs.length);
  return found.sort((a, b) => a - b);
}

export interface AnalyzeOptions {
  durationSeconds: number;
  /** Curves of comparable videos on the same ratio grid; their median becomes the baseline. */
  comparables?: RetentionPoint[][];
  /** Robust z-score above which a residual is flagged. */
  threshold?: number;
}

function resample(points: RetentionPoint[], ratios: number[]): number[] {
  const sorted = [...points].sort((a, b) => a.ratio - b.ratio);
  return ratios.map((r) => {
    const j = sorted.findIndex((p) => p.ratio >= r);
    if (j <= 0) return sorted[Math.max(j, 0)].watchRatio;
    const p0 = sorted[j - 1];
    const p1 = sorted[j];
    const t = (r - p0.ratio) / (p1.ratio - p0.ratio || 1);
    return p0.watchRatio + t * (p1.watchRatio - p0.watchRatio);
  });
}

export function analyzeRetention(points: RetentionPoint[], opts: AnalyzeOptions): RetentionAnalysis {
  const sorted = [...points].sort((a, b) => a.ratio - b.ratio);
  const ratios = sorted.map((p) => p.ratio);
  const raw = sorted.map((p) => p.watchRatio);
  const smoothed = smooth(raw);
  const limitations = [
    "audienceWatchRatio counts rewatches and skips, so it is not the share of unique viewers still watching.",
    "Positions are normalized to the video length; claims finer than the reported resolution are not supported.",
    "Analytics can lag publication by days.",
  ];

  let expected: number[];
  let baselineSource: RetentionAnalysis["baselineSource"];
  const comparables = (opts.comparables ?? []).filter((c) => c.length >= 10);
  if (comparables.length >= 3) {
    const grids = comparables.map((c) => smooth(resample(c, ratios)));
    expected = ratios.map((_, i) => median(grids.map((g) => g[i])));
    baselineSource = "comparable_median";
  } else {
    const f = fitDecay(ratios, smoothed);
    expected = ratios.map(f);
    baselineSource = "fitted_decay";
    limitations.push("Fewer than three comparable videos: the baseline is a fitted decay curve for this video alone, not channel history.");
  }

  const residuals = smoothed.map((v, i) => v - expected[i]);
  const threshold = opts.threshold ?? 2.5;
  const scale = mad(residuals);
  const slope = smoothed.map((v, i) => (i === 0 ? 0 : v - smoothed[i - 1]));
  const expSlope = expected.map((v, i) => (i === 0 ? 0 : v - expected[i - 1]));
  const slopeResid = slope.map((s, i) => s - expSlope[i]);
  const slopeScale = mad(slopeResid.slice(1));
  const cps = new Set(changePoints(smoothed));

  const residualFlag = residuals.map((r) => Math.abs(r) >= MIN_RESIDUAL && Math.abs(r) / scale > threshold);
  const slopeFlag = slopeResid.map((sr, i) => i > 0 && Math.abs(sr) >= MIN_SLOPE && Math.abs(sr) / slopeScale > threshold + 0.5);

  const resolutionSeconds = ratios.length > 1 ? opts.durationSeconds * median(ratios.slice(1).map((r, i) => r - ratios[i])) : opts.durationSeconds;
  const toSec = (r: number) => Math.round(r * opts.durationSeconds * 10) / 10;
  const last = ratios.length - 1;

  // Runs of consecutive indices where `flag` holds with a consistent sign.
  const runs = (flag: boolean[], signal: number[]) => {
    const out: [number, number][] = [];
    for (let i = 0; i <= last; i++) {
      if (!flag[i]) continue;
      let j = i;
      while (j + 1 <= last && flag[j + 1] && Math.sign(signal[j + 1]) === Math.sign(signal[i])) j++;
      out.push([i, j]);
      i = j;
    }
    return out;
  };

  const anomalies: RetentionAnomaly[] = [];
  const push = (i: number, j: number, sign: number, detectors: RetentionAnomaly["detectors"], gapIdx: number) => {
    const startRatio = ratios[Math.max(0, i - 1)];
    const endRatio = ratios[Math.min(j, last)];
    // Look back at least CONTEXT_BEFORE seconds: the cause often precedes the exit.
    const ctxStartSeconds = Math.max(0, toSec(startRatio) - Math.max(CONTEXT_BEFORE, (j - i + 1) * resolutionSeconds));
    anomalies.push({
      direction: sign < 0 ? "steeper_decline" : "stronger_hold",
      startRatio,
      endRatio,
      startSeconds: toSec(startRatio),
      endSeconds: toSec(endRatio),
      contextStartSeconds: Math.round(ctxStartSeconds * 10) / 10,
      contextEndSeconds: toSec(ratios[Math.min(j + 3, last)]),
      residual: Math.round(residuals[gapIdx] * 1000) / 1000,
      detectors,
    });
  };

  // Localised events: where the curve bends away from the expected slope.
  // A step drop leaves a lasting gap, so the gap is reported as the size of
  // the event rather than as one interval stretching to the end of the video.
  const slopeRuns = runs(slopeFlag, slopeResid);
  for (const [i, j] of slopeRuns) {
    const after = Math.min(j + 2, last);
    const detectors: RetentionAnomaly["detectors"] = ["slope"];
    if (residualFlag.slice(i, after + 1).some(Boolean)) detectors.push("residual");
    if ([...cps].some((c) => c >= i - 1 && c <= j + 1)) detectors.push("change_point");
    push(i, j, Math.sign(slopeResid[i]), detectors, after);
  }
  // Gradual divergence with no sharp bend anywhere inside it.
  for (const [i, j] of runs(residualFlag, residuals)) {
    if (slopeRuns.some(([a, b]) => a <= j + 2 && b >= i - 2)) continue;
    const peak = residuals.slice(i, j + 1).reduce((best, r, k) => (Math.abs(r) > Math.abs(residuals[best]) ? i + k : best), i);
    push(i, j, Math.sign(residuals[i]), ["residual"], peak);
  }

  const openingIdx = ratios.findIndex((r) => r * opts.durationSeconds >= 30);
  return {
    smoothed,
    expected,
    residuals,
    ratios,
    baselineSource,
    resolutionSeconds: Math.round(resolutionSeconds * 10) / 10,
    anomalies: anomalies.sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual)),
    openingRetention: openingIdx >= 0 ? Math.round(smoothed[openingIdx] * 1000) / 1000 : null,
    limitations,
  };
}

/**
 * Parses a retention CSV. Accepts YouTube Studio exports or any CSV with a
 * position column (ratio 0–1, percent, or seconds) and a retention column.
 */
export function parseRetentionCsv(csv: string, durationSeconds?: number): RetentionPoint[] {
  const rows = csv
    .trim()
    .split(/\r?\n/)
    .map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
  if (rows.length < 2) throw new Error("CSV needs a header row and data rows");
  const header = rows[0].map((h) => h.toLowerCase());
  const find = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  let posCol = find("elapsedvideotimeratio", "ratio", "position", "elapsed", "time", "second");
  let valCol = find("audiencewatchratio", "watch ratio", "retention", "audience");
  if (posCol < 0) posCol = 0;
  if (valCol < 0 || valCol === posCol) valCol = posCol === 0 ? 1 : 0;
  const relCol = find("relativeretentionperformance", "relative");

  const parse = (s: string) => {
    if (/^\d+:\d+(:\d+)?$/.test(s)) return s.split(":").reduce((acc, p) => acc * 60 + Number(p), 0);
    return Number(s.replace("%", ""));
  };
  const data = rows.slice(1).filter((r) => r.length > Math.max(posCol, valCol));
  let pos = data.map((r) => parse(r[posCol]));
  let val = data.map((r) => parse(r[valCol]));
  if (pos.some((p) => Number.isNaN(p)) || val.some((v) => Number.isNaN(v))) throw new Error("CSV contains non-numeric values");

  const maxPos = Math.max(...pos);
  if (maxPos > 1.0001) {
    const isPercent = maxPos <= 100 && !header[posCol].includes("sec") && !data.some((r) => r[posCol].includes(":"));
    const denom = isPercent ? 100 : (durationSeconds ?? maxPos);
    pos = pos.map((p) => p / denom);
  }
  // Watch ratios can exceed 1 with rewatches but not by this much; treat as percentages.
  if (Math.max(...val) > 3) val = val.map((v) => v / 100);

  return pos
    .map((ratio, k) => ({
      ratio,
      watchRatio: val[k],
      ...(relCol >= 0 ? { relativePerformance: Number(data[k][relCol]) } : {}),
    }))
    .sort((a, b) => a.ratio - b.ratio);
}
