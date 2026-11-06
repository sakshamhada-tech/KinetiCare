import { test, expect } from '@playwright/test';
import { getDb } from '../../apps/server/src/db.js';
import path from 'node:path';

/** Base URL of the KinetiCare API server (started by the playwright webServer). */
const BASE = 'http://127.0.0.1:8080';

test('golden path: health check -> create patient -> create exercise -> create session -> list sessions', async ({
  request,
}) => {
  // 1. Health endpoint is reachable.
  const health = await request.get(`${BASE}/api/health`);
  expect(health.status()).toBe(200);
  const healthBody = await health.json();
  expect(healthBody.status).toBe('ok');

  // 2. Create a patient.
  const patientRes = await request.post(`${BASE}/api/patients`, {
    data: {
      name: 'E2E Patient',
      pseudonymous_id: `E2E-PATIENT-${Date.now()}`,
      notes: 'End-to-end golden path patient.',
    },
  });
  expect(patientRes.status()).toBe(201);
  const patientBody = await patientRes.json();
  expect(typeof patientBody.id).toBe('string');
  const patientId = patientBody.id;

  // 3. Create an exercise (also seeds the initial threshold version v1).
  const exerciseRes = await request.post(`${BASE}/api/exercises`, {
    data: {
      key: `e2e-exercise-${Date.now()}`,
      name: 'E2E Squat',
      view: 'either',
      target_reps: 10,
      target_sets: 3,
    },
  });
  expect(exerciseRes.status()).toBe(201);
  const exerciseBody = await exerciseRes.json();
  expect(typeof exerciseBody.id).toBe('string');
  const exerciseId = exerciseBody.id;

  // 4. Read the threshold version id for this exercise (seeded at exercise creation).
  const dbPath = path.resolve(process.cwd(), 'data', 'kineticare.db');
  const db = getDb(dbPath);
  const row = db
    .prepare('SELECT id FROM exercise_threshold_versions WHERE exercise_id = ? AND version = 1')
    .get(exerciseId) as { id: string } | undefined;
  expect(row).toBeDefined();
  const thresholdVersionId = row!.id;

  // 5. Create a session with a numbers-only summary.
  const now = new Date().toISOString();
  const sessionRes = await request.post(`${BASE}/api/sessions`, {
    data: {
      patient_id: patientId,
      routine_id: null,
      exercise_id: exerciseId,
      threshold_version_id: thresholdVersionId,
      started_at: now,
      ended_at: now,
      duration_ms: 60000,
      pain_score: 2,
      rpe: 4,
      sets: [],
    },
  });
  expect(sessionRes.status()).toBe(201);
  const sessionBody = await sessionRes.json();
  expect(typeof sessionBody.id).toBe('string');
  const sessionId = sessionBody.id;

  // 6. Listing sessions returns the created session.
  const listRes = await request.get(`${BASE}/api/sessions`);
  expect(listRes.status()).toBe(200);
  const listBody = await listRes.json();
  expect(Array.isArray(listBody.data)).toBe(true);
  expect(listBody.data.some((s: { id: string }) => s.id === sessionId)).toBe(true);

  // Close the test DB handle so it does not linger.
  db.close();
});
