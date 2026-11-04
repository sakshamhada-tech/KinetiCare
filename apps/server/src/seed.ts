import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { getDb, closeDb, migrate } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/* Seed data                                                          */
/* ------------------------------------------------------------------ */

const now = () => new Date().toISOString();
const uuidv4 = randomUUID;

const exercises = [
  {
    key: 'squat',
    name: 'Bodyweight Squat',
    view: 'either' as const,
    targetReps: 10,
    targetSets: 3,
    thresholds: {
      exerciseKey: 'squat',
      kneeValgusMaxPercent: 8,
      minKneeFlexionDeg: 100,
      maxTrunkLeanDeg: 35,
      maxAsymmetryDeg: 10,
      minRepDurationMs: 800,
      minRepRomDeg: 40,
      hysteresisDeg: 5,
    },
  },
  {
    key: 'shoulder-external-rotation',
    name: 'Shoulder External Rotation',
    view: 'frontal' as const,
    targetReps: 12,
    targetSets: 3,
    thresholds: {
      exerciseKey: 'shoulder-external-rotation',
      targetElbowFlexionDeg: 90,
      maxElbowFlexionDeviationDeg: 15,
      maxElbowDriftCm: 8,
      maxShoulderElevationDeg: 12,
      minForearmRotationDeg: 60,
      minRepDurationMs: 800,
      minRepRomDeg: 30,
      hysteresisDeg: 5,
    },
  },
] as const;

function run(dbPath: string) {
  const db = getDb(dbPath);

  // Ensure migrations applied.
  const migrationsDir = path.join(__dirname, 'migrations');
  const { applied } = migrate(db, migrationsDir);
  console.log(`[seed] migrations applied: ${applied.length}`);

  // Clear existing seed data (idempotent-ish for dev reset).
  db.prepare('DELETE FROM reports').run();
  db.prepare('DELETE FROM fault_events').run();
  db.prepare('DELETE FROM reps').run();
  db.prepare('DELETE FROM session_sets').run();
  db.prepare('DELETE FROM sessions').run();
  db.prepare('DELETE FROM patient_routines').run();
  db.prepare('DELETE FROM routine_items').run();
  db.prepare('DELETE FROM routines').run();
  db.prepare('DELETE FROM exercise_threshold_versions').run();
  db.prepare('DELETE FROM exercises').run();
  db.prepare('DELETE FROM patients').run();

  const insertExercise = db.prepare(
    'INSERT INTO exercises (id, key, name, view, target_reps, target_sets, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertThresholdVersion = db.prepare(
    'INSERT INTO exercise_threshold_versions (id, exercise_id, version, thresholds, created_at) VALUES (?, ?, ?, ?, ?)'
  );

  const thresholdVersionIds: string[] = [];
  for (const ex of exercises) {
    const id = uuidv4();
    insertExercise.run(id, ex.key, ex.name, ex.view, ex.targetReps, ex.targetSets, now(), now());
    const versionId = uuidv4();
    insertThresholdVersion.run(versionId, id, 1, JSON.stringify(ex.thresholds), now());
    thresholdVersionIds.push(versionId);
  }

  // A default routine containing both exercises.
  const routineId = uuidv4();
  db.prepare('INSERT INTO routines (id, name, created_at) VALUES (?, ?, ?)').run(
    routineId,
    'Getting Started',
    now()
  );
  let order = 0;
  for (const ex of exercises) {
    const exId = db.prepare('SELECT id FROM exercises WHERE key = ?').get(ex.key) as { id: string };
    db.prepare(
      'INSERT INTO routine_items (id, routine_id, exercise_id, order_index, sets, reps) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), routineId, exId.id, order++, ex.targetSets, ex.targetReps);
  }

  // A demo patient.
  const patientId = uuidv4();
  db.prepare(
    'INSERT INTO patients (id, created_at, name, pseudonymous_id, notes) VALUES (?, ?, ?, ?, ?)'
  ).run(patientId, now(), 'Demo Patient', 'PATIENT-001', 'Seeded demo patient.');

  // Assign routine to patient.
  db.prepare(
    'INSERT INTO patient_routines (id, patient_id, routine_id, assigned_at) VALUES (?, ?, ?, ?)'
  ).run(uuidv4(), patientId, routineId, now());

  closeDb();
  console.log(`[seed] complete. threshold versions: ${thresholdVersionIds.length}`);
}

const dbPath = process.argv[2] ?? path.join(__dirname, '..', 'data', 'kineticare.db');
run(dbPath);
