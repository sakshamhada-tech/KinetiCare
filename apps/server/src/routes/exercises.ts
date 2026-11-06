import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import {
  createExerciseSchema,
  exerciseThresholdsSchema,
  updateExerciseSchema,
  type Exercise,
  type CreateExercise,
  type UpdateExercise,
  type UtcTimestamp,
  paginationQuerySchema,
  type PaginationQuery,
} from '@kineticare/shared';
import { getDb } from '../db.js';

interface RouteOptions extends FastifyPluginOptions {
  dbPath: string;
}

export default async function exerciseRoutes(
  fastify: FastifyInstance,
  opts: RouteOptions
): Promise<void> {
  const dbPath = opts.dbPath;

  // List exercises (paginated).
  fastify.get<{ Querystring: PaginationQuery }>('/', async (_request, reply) => {
    const query = paginationQuerySchema.parse(_request.query);
    const { page, page_size } = query;
    const db = getDb(dbPath);
    const offset = (page - 1) * page_size;
    const rows = db
      .prepare('SELECT * FROM exercises ORDER BY name LIMIT ? OFFSET ?')
      .all(page_size, offset) as Exercise[];
    const total = db.prepare('SELECT COUNT(*) AS c FROM exercises').get() as { c: number };
    return reply.send({
      data: rows,
      page,
      page_size,
      total: total.c,
      total_pages: Math.ceil(total.c / page_size),
    });
  });

  // Get one exercise.
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb(dbPath);
    const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(request.params.id) as
      | Exercise
      | undefined;
    if (!row) {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Exercise not found' } });
    }
    return reply.send(row);
  });

  // Create an exercise + initial threshold version.
  fastify.post(
    '/',
    {},
    async (request: FastifyRequest<{ Body: CreateExercise }>, reply: FastifyReply) => {
      const body = createExerciseSchema.parse(request.body);
      const db = getDb(dbPath);
      const id = randomUUID();
      const now = new Date().toISOString() as UtcTimestamp;
      db.prepare(
        'INSERT INTO exercises (id, key, name, view, target_reps, target_sets, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id,
        body.key,
        body.name,
        body.view,
        body.target_reps,
        request.body.target_sets,
        now,
        now
      );
      // Initial threshold version 1.
      const versionId = randomUUID();
      db.prepare(
        'INSERT INTO exercise_threshold_versions (id, exercise_id, version, thresholds, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(versionId, id, 1, JSON.stringify({}), now);
      const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id) as Exercise;
      return reply.status(201).send(row);
    }
  );

  // Update an exercise (creates a new threshold version when thresholds change).
  fastify.put<{ Params: { id: string }; Body: UpdateExercise }>('/:id', async (request, reply) => {
    updateExerciseSchema.parse(request.body);
    const db = getDb(dbPath);
    const existing = db.prepare('SELECT * FROM exercises WHERE id = ?').get(request.params.id) as
      | Exercise
      | undefined;
    if (!existing) {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Exercise not found' } });
    }
    const now = new Date().toISOString() as UtcTimestamp;
    const updated: Exercise = {
      ...existing,
      ...request.body,
      updated_at: now,
    };
    db.prepare(
      'UPDATE exercises SET key = ?, name = ?, view = ?, target_reps = ?, target_sets = ?, updated_at = ? WHERE id = ?'
    ).run(
      updated.key,
      updated.name,
      updated.view,
      updated.target_reps,
      updated.target_sets,
      now,
      request.params.id
    );
    const row = db
      .prepare('SELECT * FROM exercises WHERE id = ?')
      .get(request.params.id) as Exercise;
    return reply.send(row);
  });

  // Replace thresholds for an exercise (new immutable version).
  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/:id/thresholds',
    async (request, reply) => {
      const db = getDb(dbPath);
      const existing = db.prepare('SELECT * FROM exercises WHERE id = ?').get(request.params.id) as
        | Exercise
        | undefined;
      if (!existing) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Exercise not found' } });
      }
      const thresholds = exerciseThresholdsSchema.parse(request.body);
      const latest = db
        .prepare(
          'SELECT version FROM exercise_threshold_versions WHERE exercise_id = ? ORDER BY version DESC LIMIT 1'
        )
        .get(request.params.id) as { version: number } | undefined;
      const nextVersion = (latest?.version ?? 0) + 1;
      const versionId = randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO exercise_threshold_versions (id, exercise_id, version, thresholds, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(versionId, request.params.id, nextVersion, JSON.stringify(thresholds), now);
      const row = db
        .prepare('SELECT * FROM exercise_threshold_versions WHERE exercise_id = ? AND version = ?')
        .get(request.params.id, nextVersion);
      return reply.status(201).send(row);
    }
  );
}
