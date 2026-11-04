import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../src/index.js';
import { migrate, getDb, closeDb } from '../src/db.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeApp(dbPath: string) {
  return buildServer({
    NODE_ENV: 'test',
    PORT: 0,
    HOST: '127.0.0.1',
    APP_ORIGIN: 'http://127.0.0.1:5173',
    DB_PATH: dbPath,
    OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    OLLAMA_MODEL: 'llama3:8b-instruct',
    OLLAMA_TIMEOUT_MS: 5000,
  });
}

let app: Awaited<ReturnType<typeof buildServer>>['app'];
let dbPath: string;

beforeAll(async () => {
  dbPath = path.join(__dirname, '..', 'data', `test-${randomUUID()}.db`);
  const { app: a } = await makeApp(dbPath);
  app = a;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  closeDb(dbPath);
});

beforeEach(async () => {
  // Fresh DB per test to avoid cross-test contamination.
  const db = getDb(dbPath);
  const migrationsDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'src',
    'migrations'
  );
  migrate(db, migrationsDir);
});

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('kineticare-server');
  });
});

describe('exercises CRUD', () => {
  let createdId: string;

  it('lists exercises (empty then seeded via create)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/exercises' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: unknown[]; total: number };
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('creates an exercise (201) with validation errors (400)', async () => {
    const good = await app.inject({
      method: 'POST',
      url: '/api/exercises',
      payload: {
        key: 'squat',
        name: 'Bodyweight Squat',
        view: 'frontal',
        target_reps: 10,
        target_sets: 3,
      },
    });
    expect(good.statusCode).toBe(201);
    const created = good.json() as { id: string };
    createdId = created.id;

    const bad = await app.inject({
      method: 'POST',
      url: '/api/exercises',
      payload: { key: 'x', name: '', view: 'frontal' },
    });
    expect(bad.statusCode).toBe(400);
    const bj = bad.json() as { error: { code: string } };
    expect(bj.error.code).toBe('VALIDATION_ERROR');
  });

  it('gets one exercise (200) and 404 for missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/exercises/${createdId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; name: string };
    expect(body.id).toBe(createdId);

    const missing = await app.inject({
      method: 'GET',
      url: '/api/exercises/00000000-0000-0000-0000-000000000000',
    });
    expect(missing.statusCode).toBe(404);
  });

  it('updates an exercise', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/exercises/${createdId}`,
      payload: { name: 'Bodyweight Squat (revised)' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { name: string };
    expect(body.name).toBe('Bodyweight Squat (revised)');
  });

  it('sets thresholds (new version) and lists versions', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/exercises/${createdId}/thresholds`,
      payload: {
        kneeValgusMaxPercent: 6,
        minKneeFlexionDeg: 100,
        maxTrunkLeanDeg: 30,
        maxAsymmetryDeg: 8,
        minRepDurationMs: 900,
        minRepRomDeg: 45,
        hysteresisDeg: 4,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { version: number; thresholds: unknown };
    expect(body.version).toBeGreaterThanOrEqual(1);
  });

  it('pagination works', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/exercises?page=1&page_size=5',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { page: number; page_size: number; total_pages: number };
    expect(body.page).toBe(1);
    expect(body.page_size).toBe(5);
  });
});

describe('exercises edge cases', () => {
  it('updating a nonexistent exercise returns 404', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/exercises/00000000-0000-0000-0000-000000000000',
      payload: { name: 'Nope' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('setting thresholds for a nonexistent exercise returns 404', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/exercises/00000000-0000-0000-0000-000000000000/thresholds',
      payload: {
        kneeValgusMaxPercent: 6,
        minKneeFlexionDeg: 100,
        maxTrunkLeanDeg: 30,
        maxAsymmetryDeg: 8,
        minRepDurationMs: 900,
        minRepRomDeg: 45,
        hysteresisDeg: 4,
      },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('patients CRUD', () => {
  it('creates patient and lists (paginated)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/patients',
      payload: {
        name: 'Jane Doe',
        pseudonymous_id: 'PT-001',
        notes: 'demo',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string; pseudonymous_id: string };
    expect(body.pseudonymous_id).toBe('PT-001');

    const list = await app.inject({ method: 'GET', url: '/api/patients' });
    expect(list.statusCode).toBe(200);
    const lj = list.json() as { data: unknown[]; total: number };
    expect(lj.total).toBeGreaterThanOrEqual(1);
  });

  it('rejects duplicate pseudonymous_id (409)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/patients',
      payload: { name: 'Dup', pseudonymous_id: 'PT-001', notes: '' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('404 for missing patient', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/patients/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(404);
  });

  it('updates an existing patient', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/patients',
      payload: { name: 'Original', pseudonymous_id: `PU-${randomUUID().slice(0, 6)}`, notes: 'x' },
    });
    const id = (created.json() as { id: string }).id;
    const res = await app.inject({
      method: 'PUT',
      url: `/api/patients/${id}`,
      payload: { name: 'Updated', pseudonymous_id: `PU-${randomUUID().slice(0, 6)}`, notes: 'y' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { name: string };
    expect(body.name).toBe('Updated');
  });

  it('updating a nonexistent patient returns 404', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/patients/00000000-0000-0000-0000-000000000000',
      payload: { name: 'Nope', pseudonymous_id: 'x', notes: '' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('routines', () => {
  it('creates routine with items and lists items', async () => {
    // Create an exercise first.
    const ex = await app.inject({
      method: 'POST',
      url: '/api/exercises',
      payload: {
        key: 'bench',
        name: 'Bench Press',
        view: 'frontal',
        target_reps: 8,
        target_sets: 3,
      },
    });
    const exId = ex.json() as { id: string };

    const res = await app.inject({
      method: 'POST',
      url: '/api/routines',
      payload: {
        name: 'Upper Body',
        items: [{ exercise_id: exId.id, order_index: 0, sets: 3, reps: 8 }],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string };
    const rid = body.id;

    const items = await app.inject({ method: 'GET', url: `/api/routines/${rid}/items` });
    expect(items.statusCode).toBe(200);
    const ij = items.json() as unknown[];
    expect(ij.length).toBe(1);
  });

  it('lists routines', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/routines' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: unknown[]; total: number };
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe('sessions', () => {
  let patientId: string;
  let exerciseId: string;
  let thresholdVersionId: string;
  let sessionId: string;

  beforeEach(async () => {
    const p = await app.inject({
      method: 'POST',
      url: '/api/patients',
      payload: { name: 'Session Patient', pseudonymous_id: `SP-${randomUUID().slice(0, 8)}` },
    });
    patientId = (p.json() as { id: string }).id;
    const e = await app.inject({
      method: 'POST',
      url: '/api/exercises',
      payload: {
        key: `curl-${randomUUID().slice(0, 6)}`,
        name: 'Bicep Curl',
        view: 'frontal',
        target_reps: 10,
        target_sets: 3,
      },
    });
    exerciseId = (e.json() as { id: string }).id;
    await app.inject({
      method: 'PUT',
      url: `/api/exercises/${exerciseId}/thresholds`,
      payload: {
        kneeValgusMaxPercent: 8,
        minKneeFlexionDeg: 100,
        maxTrunkLeanDeg: 35,
        maxAsymmetryDeg: 10,
        minRepDurationMs: 800,
        minRepRomDeg: 40,
        hysteresisDeg: 5,
      },
    });
    // fetch the version id row
    const db = getDb(dbPath);
    if (!exerciseId) throw new Error('exerciseId not created');
    const row = db
      .prepare('SELECT id FROM exercise_threshold_versions WHERE exercise_id = ? AND version = ?')
      .get([exerciseId, 1]) as { id: string } | undefined;
    if (!row) throw new Error('threshold version not seeded');
    thresholdVersionId = row.id;
  });

  it('POST /api/sessions stores numbers-only summary and returns 201', async () => {
    const now = new Date().toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        patient_id: patientId,
        routine_id: null,
        exercise_id: exerciseId,
        threshold_version_id: thresholdVersionId,
        started_at: now,
        ended_at: now,
        duration_ms: 60000,
        pain_score: 2,
        rpe: 4,
        sets: [
          {
            set_index: 0,
            started_at: now,
            ended_at: now,
            reps: [
              {
                rep_index: 0,
                started_at: now,
                ended_at: now,
                duration_ms: 1200,
                min_angle_deg: 90,
                max_angle_deg: 170,
                rom_deg: 80,
                peak_velocity_deg_per_s: 45,
                faults: ['knee-valgus'],
              },
              {
                rep_index: 1,
                started_at: now,
                ended_at: now,
                duration_ms: 1100,
                min_angle_deg: 95,
                max_angle_deg: 170,
                rom_deg: 75,
                peak_velocity_deg_per_s: 40,
                faults: [],
              },
            ],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string };
    expect(typeof body.id).toBe('string');
    sessionId = body.id;
  });

  it('rejects unknown patient_id (400)', async () => {
    const now = new Date().toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        patient_id: '00000000-0000-0000-0000-000000000000',
        routine_id: null,
        exercise_id: exerciseId,
        threshold_version_id: thresholdVersionId,
        started_at: now,
        ended_at: now,
        duration_ms: 1000,
        sets: [],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('lists sessions', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sessions' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: unknown[]; total: number };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it('gets one session (200) and 404 for missing', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/sessions/${sessionId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string };
    expect(body.id).toBe(sessionId);
    const missing = await app.inject({
      method: 'GET',
      url: '/api/sessions/00000000-0000-0000-0000-000000000000',
    });
    expect(missing.statusCode).toBe(404);
  });

  it('POST /:id/report generates a draft report (201)', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/sessions/${sessionId}/report` });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string; status: string };
    expect(typeof body.id).toBe('string');
    expect(body.status).toBe('draft');
  });

  it('POST /:id/report returns 404 for a missing session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions/00000000-0000-0000-0000-000000000000/report',
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects unknown exercise_id (400)', async () => {
    const now = new Date().toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        patient_id: patientId,
        routine_id: null,
        exercise_id: '00000000-0000-0000-0000-000000000000',
        threshold_version_id: thresholdVersionId,
        started_at: now,
        ended_at: now,
        duration_ms: 1000,
        sets: [],
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('error envelope', () => {
  it('returns consistent envelope on 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBeDefined();
    expect(body.error.message).toBeDefined();
  });
});
