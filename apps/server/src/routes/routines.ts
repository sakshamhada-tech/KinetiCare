import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { type Routine, type RoutineItem } from '@kineticare/shared';
import { getDb } from '../db.js';

interface RouteOptions extends FastifyPluginOptions {
  dbPath: string;
}

const routineItemSchema = z.object({
  exercise_id: z.string().uuid(),
  order_index: z.coerce.number().int().min(0).default(0),
  sets: z.coerce.number().int().positive().default(3),
  reps: z.coerce.number().int().positive().default(10),
});
const createRoutineBodySchema = z.object({
  name: z.string().min(1).max(200),
  items: z.array(routineItemSchema).default([]),
});
type CreateRoutineBody = z.infer<typeof createRoutineBodySchema>;

export default async function routineRoutes(
  fastify: FastifyInstance,
  opts: RouteOptions
): Promise<void> {
  const dbPath = opts.dbPath;

  fastify.get<{ Querystring: { page?: string; page_size?: string } }>(
    '/',
    async (request, reply) => {
      const db = getDb(dbPath);
      const page = Math.max(1, Number(request.query.page ?? 1));
      const page_size = Math.min(100, Math.max(1, Number(request.query.page_size ?? 20)));
      const offset = (page - 1) * page_size;
      const rows = db
        .prepare('SELECT * FROM routines ORDER BY name LIMIT ? OFFSET ?')
        .all(page_size, offset) as Routine[];
      const total = db.prepare('SELECT COUNT(*) AS c FROM routines').get() as { c: number };
      return reply.send({
        data: rows,
        page,
        page_size,
        total: total.c,
        total_pages: Math.ceil(total.c / page_size),
      });
    }
  );

  fastify.post<{ Body: CreateRoutineBody }>(
    '/',
    async (request: FastifyRequest<{ Body: CreateRoutineBody }>, reply: FastifyReply) => {
      const body = createRoutineBodySchema.parse(request.body);
      const db = getDb(dbPath);
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare('INSERT INTO routines (id, name, created_at) VALUES (?, ?, ?)').run(
        id,
        body.name,
        now
      );
      let order = 0;
      for (const item of body.items) {
        const parsed = routineItemSchema.parse(item);
        const orderIndex = parsed.order_index >= 0 ? parsed.order_index : order++;
        db.prepare(
          'INSERT INTO routine_items (id, routine_id, exercise_id, order_index, sets, reps) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(randomUUID(), id, parsed.exercise_id, orderIndex, parsed.sets, parsed.reps);
      }
      const row = db.prepare('SELECT * FROM routines WHERE id = ?').get(id) as Routine;
      return reply.status(201).send(row);
    }
  );

  fastify.get<{ Params: { id: string } }>('/:id/items', async (request, reply) => {
    const db = getDb(dbPath);
    const rows = db
      .prepare(
        'SELECT ri.*, e.key, e.name AS exercise_name FROM routine_items ri JOIN exercises e ON ri.exercise_id = e.id WHERE ri.routine_id = ? ORDER BY ri.order_index'
      )
      .all(request.params.id) as (RoutineItem & { key: string; exercise_name: string })[];
    return reply.send(rows);
  });
}
