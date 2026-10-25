// Ordered, append-only migrations. Each entry runs once and is recorded in
// schema_migrations. Keep in sync with schema.ts.
export const migrations: { id: string; sql: string }[] = [
  {
    id: "0001_init",
    sql: `
CREATE TABLE channels (
  id text PRIMARY KEY,
  name text NOT NULL,
  youtube_channel_id text,
  connected boolean NOT NULL DEFAULT false,
  identity jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id text PRIMARY KEY,
  title text NOT NULL,
  intent text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'idea',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE artifacts (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  current_version_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX artifacts_project_idx ON artifacts(project_id);

CREATE TABLE artifact_versions (
  id text PRIMARY KEY,
  artifact_id text NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  parent_version_id text,
  origin text NOT NULL,
  label text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  data jsonb NOT NULL DEFAULT '{}',
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX artifact_versions_artifact_idx ON artifact_versions(artifact_id);

CREATE TABLE source_assets (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename text NOT NULL,
  path text NOT NULL,
  mime text NOT NULL,
  size_bytes integer NOT NULL,
  probe jsonb,
  transcript jsonb,
  silences jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE edit_plans (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_asset_id text NOT NULL REFERENCES source_assets(id) ON DELETE CASCADE,
  treatment text NOT NULL,
  summary text NOT NULL DEFAULT '',
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE edit_operations (
  id text PRIMARY KEY,
  plan_id text NOT NULL REFERENCES edit_plans(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  type text NOT NULL,
  executability text NOT NULL,
  title text NOT NULL,
  rationale text NOT NULL DEFAULT '',
  source_in double precision,
  source_out double precision,
  target_at double precision,
  required_assets jsonb NOT NULL DEFAULT '[]',
  warnings jsonb NOT NULL DEFAULT '[]',
  lesson_ids jsonb NOT NULL DEFAULT '[]',
  enabled boolean NOT NULL DEFAULT true,
  review_status text NOT NULL DEFAULT 'proposed'
);
CREATE INDEX edit_operations_plan_idx ON edit_operations(plan_id);

CREATE TABLE renders (
  id text PRIMARY KEY,
  plan_id text NOT NULL REFERENCES edit_plans(id) ON DELETE CASCADE,
  path text,
  operation_ids jsonb NOT NULL,
  timeline jsonb NOT NULL,
  duration double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lessons (
  id text PRIMARY KEY,
  claim text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}',
  evidence jsonb NOT NULL DEFAULT '[]',
  counterexamples jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'observation',
  applicability text NOT NULL DEFAULT '',
  strength text NOT NULL DEFAULT 'weak',
  suggested_use text NOT NULL DEFAULT '',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search tsvector GENERATED ALWAYS AS (
    to_tsvector('english', claim || ' ' || applicability || ' ' || suggested_use || ' ' || scope::text)
  ) STORED
);
CREATE INDEX lessons_search_idx ON lessons USING gin(search);

CREATE TABLE retention_curves (
  id text PRIMARY KEY,
  project_id text REFERENCES projects(id) ON DELETE CASCADE,
  label text NOT NULL,
  format text NOT NULL DEFAULT 'long-form',
  duration_seconds double precision NOT NULL,
  points jsonb NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE findings (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  curve_id text REFERENCES retention_curves(id) ON DELETE CASCADE,
  label text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  start_seconds double precision,
  end_seconds double precision,
  evidence jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feedback (
  id text PRIMARY KEY,
  project_id text REFERENCES projects(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id text NOT NULL,
  decision text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_project_idx ON events(project_id, created_at);

CREATE TABLE jobs (
  id text PRIMARY KEY,
  project_id text REFERENCES projects(id) ON DELETE CASCADE,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  stage text NOT NULL DEFAULT 'Queued',
  payload jsonb NOT NULL DEFAULT '{}',
  result jsonb,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_status_idx ON jobs(status, created_at);
`,
  },
  {
    id: "0002_gemini",
    sql: `
ALTER TABLE source_assets ADD COLUMN gemini_file jsonb;
ALTER TABLE projects ADD COLUMN youtube_video_id text;
ALTER TABLE retention_curves ADD COLUMN youtube_video_id text;
ALTER TABLE edit_plans ADD COLUMN observations jsonb NOT NULL DEFAULT '[]';
ALTER TABLE edit_plans ADD COLUMN interaction_id text;
ALTER TABLE edit_plans ADD COLUMN trace jsonb;
ALTER TABLE lessons ADD COLUMN origin text NOT NULL DEFAULT 'creator';

CREATE TABLE verifications (
  id text PRIMARY KEY,
  plan_id text NOT NULL REFERENCES edit_plans(id) ON DELETE CASCADE,
  render_id text NOT NULL REFERENCES renders(id) ON DELETE CASCADE,
  round integer NOT NULL,
  passed boolean NOT NULL,
  checks jsonb NOT NULL,
  adjustments jsonb NOT NULL DEFAULT '[]',
  summary text NOT NULL DEFAULT '',
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verifications_plan_idx ON verifications(plan_id, created_at);

CREATE TABLE youtube_videos (
  id text PRIMARY KEY,
  title text NOT NULL,
  duration_seconds double precision NOT NULL,
  published_at text,
  metrics jsonb NOT NULL DEFAULT '{}',
  curve_id text REFERENCES retention_curves(id) ON DELETE SET NULL,
  card jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);
`,
  },
];
