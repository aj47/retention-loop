import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const channels = pgTable("channels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  youtubeChannelId: text("youtube_channel_id"),
  connected: boolean("connected").notNull().default(false),
  identity: jsonb("identity").$type<ChannelIdentity>().notNull().default({}),
  createdAt: createdAt(),
});

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  intent: text("intent").notNull().default(""),
  audience: text("audience").notNull().default(""),
  stage: text("stage").$type<ProjectStage>().notNull().default("idea"),
  youtubeVideoId: text("youtube_video_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const artifacts = pgTable("artifacts", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").$type<ArtifactKind>().notNull(),
  title: text("title").notNull(),
  currentVersionId: text("current_version_id"),
  createdAt: createdAt(),
});

export const artifactVersions = pgTable("artifact_versions", {
  id: text("id").primaryKey(),
  artifactId: text("artifact_id").notNull().references(() => artifacts.id, { onDelete: "cascade" }),
  parentVersionId: text("parent_version_id"),
  origin: text("origin").$type<VersionOrigin>().notNull(),
  label: text("label").notNull().default(""),
  content: text("content").notNull().default(""),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  model: text("model"),
  createdAt: createdAt(),
});

export const sourceAssets = pgTable("source_assets", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  path: text("path").notNull(),
  mime: text("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  probe: jsonb("probe").$type<MediaProbe | null>(),
  transcript: jsonb("transcript").$type<Transcript | null>(),
  silences: jsonb("silences").$type<TimeRange[] | null>(),
  geminiFile: jsonb("gemini_file").$type<GeminiFileRef | null>(),
  createdAt: createdAt(),
});

export const editPlans = pgTable("edit_plans", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  sourceAssetId: text("source_asset_id").notNull().references(() => sourceAssets.id, { onDelete: "cascade" }),
  treatment: text("treatment").notNull(),
  summary: text("summary").notNull().default(""),
  model: text("model"),
  observations: jsonb("observations").$type<VideoObservation[]>().notNull().default([]),
  interactionId: text("interaction_id"),
  trace: jsonb("trace").$type<ModelTrace | null>(),
  createdAt: createdAt(),
});

export const editOperations = pgTable("edit_operations", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => editPlans.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(),
  type: text("type").$type<EditOperationType>().notNull(),
  executability: text("executability").$type<Executability>().notNull(),
  title: text("title").notNull(),
  rationale: text("rationale").notNull().default(""),
  sourceIn: doublePrecision("source_in"),
  sourceOut: doublePrecision("source_out"),
  targetAt: doublePrecision("target_at"),
  requiredAssets: jsonb("required_assets").$type<string[]>().notNull().default([]),
  warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
  lessonIds: jsonb("lesson_ids").$type<string[]>().notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
  reviewStatus: text("review_status").$type<ReviewStatus>().notNull().default("proposed"),
});

export const renders = pgTable("renders", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => editPlans.id, { onDelete: "cascade" }),
  path: text("path"),
  operationIds: jsonb("operation_ids").$type<string[]>().notNull(),
  timeline: jsonb("timeline").$type<TimelineSegmentMap[]>().notNull(),
  duration: doublePrecision("duration").notNull(),
  createdAt: createdAt(),
});

export const lessons = pgTable("lessons", {
  id: text("id").primaryKey(),
  claim: text("claim").notNull(),
  scope: jsonb("scope").$type<LessonScope>().notNull().default({}),
  evidence: jsonb("evidence").$type<EvidenceRef[]>().notNull().default([]),
  counterexamples: jsonb("counterexamples").$type<EvidenceRef[]>().notNull().default([]),
  status: text("status").$type<LessonStatus>().notNull().default("observation"),
  applicability: text("applicability").notNull().default(""),
  strength: text("strength").$type<EvidenceStrength>().notNull().default("weak"),
  suggestedUse: text("suggested_use").notNull().default(""),
  archived: boolean("archived").notNull().default(false),
  origin: text("origin").$type<"creator" | "gemini">().notNull().default("creator"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const retentionCurves = pgTable("retention_curves", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  format: text("format").notNull().default("long-form"),
  durationSeconds: doublePrecision("duration_seconds").notNull(),
  points: jsonb("points").$type<RetentionPoint[]>().notNull(),
  source: text("source").$type<"csv" | "youtube">().notNull(),
  youtubeVideoId: text("youtube_video_id"),
  createdAt: createdAt(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => editPlans.id, { onDelete: "cascade" }),
  renderId: text("render_id").notNull().references(() => renders.id, { onDelete: "cascade" }),
  round: integer("round").notNull(),
  passed: boolean("passed").notNull(),
  checks: jsonb("checks").$type<VerificationCheck[]>().notNull(),
  adjustments: jsonb("adjustments").$type<VerificationAdjustment[]>().notNull().default([]),
  summary: text("summary").notNull().default(""),
  model: text("model"),
  createdAt: createdAt(),
});

export const reviews = pgTable("reviews", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  targetType: text("target_type").$type<"render" | "script">().notNull(),
  targetId: text("target_id").notNull(),
  persona: text("persona").notNull(),
  status: text("status").$type<"running" | "done" | "failed">().notNull().default("running"),
  result: jsonb("result").$type<Record<string, unknown> | null>(),
  error: text("error"),
  interactionId: text("interaction_id"),
  createdAt: createdAt(),
});

export const youtubeVideos = pgTable("youtube_videos", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  durationSeconds: doublePrecision("duration_seconds").notNull(),
  publishedAt: text("published_at"),
  metrics: jsonb("metrics").$type<VideoMetrics>().notNull().default({}),
  curveId: text("curve_id").references(() => retentionCurves.id, { onDelete: "set null" }),
  card: jsonb("card").$type<Record<string, unknown> | null>(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const findings = pgTable("findings", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  curveId: text("curve_id").references(() => retentionCurves.id, { onDelete: "cascade" }),
  label: text("label").$type<EvidenceLabel>().notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  startSeconds: doublePrecision("start_seconds"),
  endSeconds: doublePrecision("end_seconds"),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});

export const feedback = pgTable("feedback", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  decision: text("decision").$type<"accepted" | "rejected" | "modified" | "preserved">().notNull(),
  note: text("note").notNull().default(""),
  createdAt: createdAt(),
});

export const events = pgTable("events", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").$type<JobType>().notNull(),
  status: text("status").$type<JobStatus>().notNull().default("queued"),
  stage: text("stage").notNull().default("Queued"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  result: jsonb("result").$type<Record<string, unknown> | null>(),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type ProjectStage = "idea" | "script" | "rough_cut" | "published";
export type ArtifactKind = "idea" | "brief" | "script" | "shot_plan";
export type VersionOrigin = "creator" | "director" | "merge";
export type EditOperationType = "trim" | "remove" | "move" | "tighten_pauses" | "insert" | "replace" | "overlay_text";
export type Executability = "direct" | "partial" | "suggested";
export type ReviewStatus = "proposed" | "accepted" | "rejected";
export type LessonStatus = "observation" | "hypothesis" | "experimentally_supported" | "inconclusive" | "outdated";
export type EvidenceStrength = "weak" | "moderate" | "strong";
export type EvidenceLabel = "observed" | "hypothesis" | "historically_associated" | "experimentally_supported" | "inconclusive";
export type JobType = "prepare_media" | "render_preview" | "verify_render" | "sync_channel" | "synthesize_memory" | "review_panel";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface ChannelIdentity {
  subject?: string;
  audience?: string;
  goals?: string;
  tone?: string;
  constraints?: string;
  preferences?: string[];
}

export interface LessonScope {
  formats?: string[];
  topics?: string[];
  audience?: string;
}

export interface EvidenceRef {
  label: string;
  videoLabel?: string;
  startSeconds?: number;
  endSeconds?: number;
  note?: string;
}

export interface TimeRange {
  start: number;
  end: number;
}

export interface MediaProbe {
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  audioSampleRate?: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  engine: string;
  language?: string;
  segments: TranscriptSegment[];
}

export interface TimelineSegmentMap {
  sourceIn: number;
  sourceOut: number;
  outputIn: number;
  outputOut: number;
}

export interface RetentionPoint {
  ratio: number;
  watchRatio: number;
  relativePerformance?: number;
}

export interface GeminiFileRef {
  name: string;
  uri: string;
  mimeType: string;
  expiresAt: string;
}

export interface VideoObservation {
  atSeconds: number;
  note: string;
}

export interface ModelTrace {
  videoLoads: number;
  thoughts: string[];
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  atSeconds: number | null;
  evidence: string;
}

export interface VerificationAdjustment {
  operationId: string;
  field: "sourceIn" | "sourceOut" | "targetAt";
  from: number | null;
  to: number;
  reason: string;
}

export interface VideoMetrics {
  views?: number;
  averageViewPercentage?: number;
  averageViewDuration?: number;
  subscribersGained?: number;
}
