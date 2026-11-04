import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { Session } from '@kineticare/shared';
import { createReportGenerator } from '../src/services/report-generator.js';
import { TemplateGenerator } from '../src/services/report-generator.js';
import { migrate, getDb } from '../src/db.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OLLAMA_URL = 'http://127.0.0.1:11555';

/* ------------------------------------------------------------------ */
/* fetch mocks                                                        */
/* ------------------------------------------------------------------ */

type FetchMock = {
  status: number;
  body: unknown;
};

function mockFetch(response: FetchMock): void {
  // Ollama's /api/generate returns JSON whose `response` field is a string
  // containing the model output. For object bodies, stringify them into that
  // `response` field. For string bodies, use them directly as `response`.
  const responseText =
    typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
  const responseBody = { response: responseText };
  const payload = JSON.stringify(responseBody);
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        json: () => Promise.resolve(responseBody),
        text: () => Promise.resolve(payload),
      } as Response)
    )
  );
}

function restoreFetch(): void {
  vi.unstubAllGlobals();
}

/* ------------------------------------------------------------------ */
/* App + DB per test                                                  */
/* ------------------------------------------------------------------ */

let dbPath: string;

beforeEach(async () => {
  restoreFetch();
  dbPath = path.join(__dirname, '..', 'data', `report-test-${randomUUID()}.db`);
  const db = getDb(dbPath);
  const migrationsDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'src',
    'migrations'
  );
  migrate(db, migrationsDir);
  const pseudo = `P-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const patientId = randomUUID();
  db.prepare(
    'INSERT INTO patients (id, created_at, name, pseudonymous_id, notes) VALUES (?, ?, ?, ?, ?)'
  ).run(patientId, now, 'P', pseudo, '');
  const exerciseId = randomUUID();
  db.prepare(
    'INSERT INTO exercises (id, key, name, view, target_reps, target_sets, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(exerciseId, 'squat', 'Squat', 'frontal', 10, 3, now, now);
  const thresholdVersionId = randomUUID();
  db.prepare(
    'INSERT INTO exercise_threshold_versions (id, exercise_id, version, thresholds, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(thresholdVersionId, exerciseId, 1, '{}', now);
  const sessionId = randomUUID();
  db.prepare(
    'INSERT INTO sessions (id, patient_id, exercise_id, threshold_version_id, started_at, ended_at, duration_ms, pain_score, rpe, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(sessionId, patientId, exerciseId, thresholdVersionId, now, now, 60000, 2, 4, 'completed');
});

afterEach(() => {
  restoreFetch();
});

function fetchSession(): Session {
  const db = getDb(dbPath);
  return db.prepare('SELECT * FROM sessions LIMIT 1').get() as Session;
}

/* ------------------------------------------------------------------ */
/* Template generator tests                                           */
/* ------------------------------------------------------------------ */

describe('TemplateGenerator', () => {
  it('produces a draft report with disclaimer', async () => {
    const gen = new TemplateGenerator();
    const sections = await gen.generate(fetchSession());
    expect(typeof sections.summary).toBe('string');
    expect(sections.limitations.toLowerCase()).toContain('draft');
    expect(sections.limitations.toLowerCase()).toContain('template');
  });
});

/* ------------------------------------------------------------------ */
/* Ollama generator tests                                             */
/* ------------------------------------------------------------------ */

describe('OllamaGenerator with mocked fetch', () => {
  it('success path returns parsed sections from ollama', async () => {
    mockFetch({
      status: 200,
      body: {
        summary: 'Session summary text.',
        objective_findings: 'Duration 60000 ms.',
        form_observations: 'No faults.',
        fatigue_assessment: 'None.',
        compliance: 'Good.',
        recommendations_for_clinician: 'Continue.',
        limitations: 'Draft - requires clinician review.',
      },
    });
    const gen = createReportGenerator(OLLAMA_URL, 'llama3:8b-instruct', 5000);
    const sections = await gen.generate(fetchSession());
    expect(sections.summary).toBe('Session summary text.');
    expect(gen.name).toBe('ollama');
  });

  it('malformed JSON -> retry -> fallback to template', async () => {
    // `response` is valid JSON but fails the report schema -> parse throws.
    mockFetch({ status: 200, body: '{}' });
    const gen = createReportGenerator(OLLAMA_URL, 'llama3:8b-instruct', 5000);
    const sections = await gen.generate(fetchSession());
    expect(sections.limitations.toLowerCase()).toContain('template');
  });

  it('HTTP 500 -> retry -> fallback to template', async () => {
    mockFetch({ status: 500, body: { error: 'server error' } });
    const gen = createReportGenerator(OLLAMA_URL, 'llama3:8b-instruct', 5000);
    const sections = await gen.generate(fetchSession());
    expect(sections.limitations.toLowerCase()).toContain('template');
  });

  it('model not found (404) -> fallback to template', async () => {
    mockFetch({ status: 404, body: { error: 'model not found' } });
    const gen = createReportGenerator(OLLAMA_URL, 'llama3:8b-instruct', 5000);
    const sections = await gen.generate(fetchSession());
    expect(sections.limitations.toLowerCase()).toContain('template');
  });

  it('hallucinated numbers -> retry once -> fallback to template', async () => {
    mockFetch({
      status: 200,
      body: {
        summary: 'The patient did 999 reps and lasted 7777777 ms.', // hallucinated numbers
        objective_findings: 'Duration 60000 ms.',
        form_observations: 'No faults.',
        fatigue_assessment: 'None.',
        compliance: 'Good.',
        recommendations_for_clinician: 'Continue.',
        limitations: 'Draft - requires clinician review.',
      },
    });
    const gen = createReportGenerator(OLLAMA_URL, 'llama3:8b-instruct', 5000);
    const sections = await gen.generate(fetchSession());
    expect(sections.limitations.toLowerCase()).toContain('template');
  });

  it('Ollama unreachable (fetch throws) -> immediate template fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('connect ECONNREFUSED')))
    );
    const gen = createReportGenerator(OLLAMA_URL, 'llama3:8b-instruct', 2000);
    const start = Date.now();
    const sections = await gen.generate(fetchSession());
    const elapsed = Date.now() - start;
    expect(sections.limitations.toLowerCase()).toContain('template');
    expect(elapsed).toBeLessThan(15000);
  });
});

/* ------------------------------------------------------------------ */
/* Live Ollama test - skipped if unreachable                          */
/* ------------------------------------------------------------------ */

describe('Live Ollama integration', () => {
  it('runs against real Ollama if reachable, otherwise skips with reason', async () => {
    let reachable = false;
    try {
      const res = await fetch(`${OLLAMA_URL}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      reachable = res.ok;
    } catch {
      reachable = false;
    }
    if (!reachable) {
      console.log(
        '[live-ollama] SKIPPED: Ollama not reachable at ' +
          OLLAMA_URL +
          ' (start Ollama and pull a model to run this test).'
      );
      // Logged skip; assert trivially so the test file still reports a test.
      expect(true).toBe(true);
      return;
    }
    const gen = createReportGenerator(OLLAMA_URL, 'llama3:8b-instruct', 30000);
    const sections = await gen.generate(fetchSession());
    expect(typeof sections.summary).toBe('string');
    expect(typeof sections.limitations).toBe('string');
    console.log('[live-ollama] RAN against real Ollama at ' + OLLAMA_URL);
  });
});
