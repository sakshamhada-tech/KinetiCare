import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import {
  sessionSummarySchema,
  type Report,
  type SessionSummary,
  type Session,
} from '@kineticare/shared';
import { getDb } from '../db.js';
import type { ReportGenerator } from '../services/report-generator.js';

interface RouteOptions extends FastifyPluginOptions {
  dbPath: string;
  reportGenerator: ReportGenerator;
}

export default async function sessionRoutes(
  fastify: FastifyInstance,
  opts: RouteOptions
): Promise<void> {
  const dbPath = opts.dbPath;
  const reportGenerator = opts.reportGenerator;

  fastify.get<{ Querystring: { page?: string; page_size?: string } }>(
    '/',
    async (request, reply) => {
      const db = getDb(dbPath);
      const page = Math.max(1, Number(request.query.page ?? 1));
      const page_size = Math.min(100, Math.max(1, Number(request.query.page_size ?? 20)));
      const offset = (page - 1) * page_size;
      const rows = db
        .prepare(
          'SELECT s.*, p.name AS patient_name, p.pseudonymous_id, e.name AS exercise_name FROM sessions s JOIN patients p ON s.patient_id = p.id JOIN exercises e ON s.exercise_id = e.id ORDER BY s.started_at DESC LIMIT ? OFFSET ?'
        )
        .all(page_size, offset) as (Session & {
        patient_name: string;
        pseudonymous_id: string;
        exercise_name: string;
      })[];
      const total = db.prepare('SELECT COUNT(*) AS c FROM sessions').get() as { c: number };
      return reply.send({
        data: rows,
        page,
        page_size,
        total: total.c,
        total_pages: Math.ceil(total.c / page_size),
      });
    }
  );

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb(dbPath);
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(request.params.id) as
      | Session
      | undefined;
    if (!row) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
    }
    return reply.send(row);
  });

  fastify.post<{ Body: SessionSummary }>(
    '/',
    async (request: FastifyRequest<{ Body: SessionSummary }>, reply: FastifyReply) => {
      const body = sessionSummarySchema.parse(request.body);
      const db = getDb(dbPath);

      // Verify patient + exercise exist.
      const patient = db.prepare('SELECT id FROM patients WHERE id = ?').get(body.patient_id);
      if (!patient) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Unknown patient_id' },
        });
      }
      const exercise = db.prepare('SELECT id FROM exercises WHERE id = ?').get(body.exercise_id);
      if (!exercise) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Unknown exercise_id' },
        });
      }

      const id = randomUUID();
      db.prepare(
        'INSERT INTO sessions (id, patient_id, routine_id, exercise_id, threshold_version_id, started_at, ended_at, duration_ms, pain_score, rpe, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id,
        body.patient_id,
        body.routine_id ?? null,
        body.exercise_id,
        body.threshold_version_id,
        body.started_at,
        body.ended_at,
        body.duration_ms,
        body.pain_score ?? null,
        body.rpe ?? null,
        'completed'
      );

      // Store sets + reps.
      for (const set of body.sets) {
        const setId = randomUUID();
        db.prepare(
          'INSERT INTO session_sets (id, session_id, set_index, started_at, ended_at, reps_count) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(setId, id, set.set_index, set.started_at, set.ended_at, set.reps.length);
        for (const rep of set.reps) {
          // rep is schema-shaped (snake_case) per sessionSummarySchema.
          db.prepare(
            'INSERT INTO reps (id, session_set_id, rep_index, started_at, ended_at, duration_ms, min_angle_deg, max_angle_deg, rom_deg, peak_velocity_deg_per_s, faults) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(
            randomUUID(),
            setId,
            rep.rep_index,
            rep.started_at,
            rep.ended_at,
            rep.duration_ms,
            rep.min_angle_deg ?? null,
            rep.max_angle_deg ?? null,
            rep.rom_deg,
            rep.peak_velocity_deg_per_s,
            JSON.stringify(rep.faults)
          );
        }
      }

      const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session;
      return reply.status(201).send(row);
    }
  );

  fastify.post<{ Params: { id: string } }>(
    '/:id/report',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const db = getDb(dbPath);
      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(request.params.id) as
        | Session
        | undefined;
      if (!session) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
      }
      // OllamaGenerator falls back to TemplateGenerator internally, so this
      // always returns sections.
      const sections = await reportGenerator.generate(session);
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO reports (id, session_id, generator, model, status, content_json, validation_result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id,
        request.params.id,
        reportGenerator.name,
        reportGenerator.model,
        'draft',
        JSON.stringify(sections),
        JSON.stringify({ passed: true, details: [] }),
        now
      );
      const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as Report;
      return reply.status(201).send(row);
    }
  );
}
