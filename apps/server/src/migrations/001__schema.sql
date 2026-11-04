-- KinetiCare schema (forward-only migration 1)
-- All timestamps are ISO-8601 UTC TEXT.

CREATE TABLE patients (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  name TEXT NOT NULL,
  pseudonymous_id TEXT NOT NULL UNIQUE,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE exercises (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  view TEXT NOT NULL CHECK (view IN ('frontal','sagittal','either')),
  target_reps INTEGER NOT NULL DEFAULT 10 CHECK (target_reps > 0),
  target_sets INTEGER NOT NULL DEFAULT 3 CHECK (target_sets > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE exercise_threshold_versions (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  thresholds TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (exercise_id, version)
);

CREATE TABLE routines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE routine_items (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL CHECK (order_index >= 0),
  sets INTEGER NOT NULL DEFAULT 3 CHECK (sets > 0),
  reps INTEGER NOT NULL DEFAULT 10 CHECK (reps > 0)
);

CREATE TABLE patient_routines (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (patient_id, routine_id)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  routine_id TEXT REFERENCES routines(id) ON DELETE SET NULL,
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  threshold_version_id TEXT NOT NULL REFERENCES exercise_threshold_versions(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  pain_score INTEGER CHECK (pain_score BETWEEN 0 AND 10),
  rpe INTEGER CHECK (rpe BETWEEN 0 AND 10),
  status TEXT NOT NULL DEFAULT 'completed'
);

CREATE TABLE session_sets (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  set_index INTEGER NOT NULL CHECK (set_index >= 0),
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  reps_count INTEGER NOT NULL DEFAULT 0 CHECK (reps_count >= 0)
);

CREATE TABLE reps (
  id TEXT PRIMARY KEY,
  session_set_id TEXT NOT NULL REFERENCES session_sets(id) ON DELETE CASCADE,
  rep_index INTEGER NOT NULL CHECK (rep_index >= 0),
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  min_angle_deg REAL CHECK (min_angle_deg BETWEEN 0 AND 180),
  max_angle_deg REAL CHECK (max_angle_deg BETWEEN 0 AND 180),
  rom_deg REAL NOT NULL CHECK (rom_deg >= 0),
  peak_velocity_deg_per_s REAL NOT NULL CHECK (peak_velocity_deg_per_s >= 0),
  faults TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE fault_events (
  id TEXT PRIMARY KEY,
  rep_id TEXT REFERENCES reps(id) ON DELETE SET NULL,
  set_index INTEGER NOT NULL CHECK (set_index >= 0),
  fault_type TEXT NOT NULL,
  timestamp_ms INTEGER NOT NULL CHECK (timestamp_ms >= 0),
  cue TEXT NOT NULL
);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  generator TEXT NOT NULL CHECK (generator IN ('ollama','template')),
  model TEXT NOT NULL DEFAULT 'template',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','archived')),
  content_json TEXT NOT NULL,
  validation_result TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  reviewed_by TEXT
);

-- Indexes for common queries.
CREATE INDEX idx_sessions_patient ON sessions(patient_id);
CREATE INDEX idx_sessions_exercise ON sessions(exercise_id);
CREATE INDEX idx_reps_set ON reps(session_set_id);
CREATE INDEX idx_fault_events_rep ON fault_events(rep_id);
CREATE INDEX idx_reports_session ON reports(session_id);
