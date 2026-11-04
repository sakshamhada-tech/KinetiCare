import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import {
  createPatientSchema,
  updatePatientSchema,
  type Patient,
  type CreatePatient,
  type UpdatePatient,
} from '@kineticare/shared';
import { getDb } from '../db.js';

interface RouteOptions extends FastifyPluginOptions {
  dbPath: string;
}

export default async function patientRoutes(
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
        .prepare('SELECT * FROM patients ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .all(page_size, offset) as Patient[];
      const total = db.prepare('SELECT COUNT(*) AS c FROM patients').get() as { c: number };
      return reply.send({
        data: rows,
        page,
        page_size,
        total: total.c,
        total_pages: Math.ceil(total.c / page_size),
      });
    }
  );

  fastify.get<{ Params: { id: string } }>(
    '/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const db = getDb(dbPath);
      const row = db.prepare('SELECT * FROM patients WHERE id = ?').get(request.params.id) as
        | Patient
        | undefined;
      if (!row) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Patient not found' } });
      }
      return reply.send(row);
    }
  );

  fastify.post<{ Body: CreatePatient }>(
    '/',
    async (request: FastifyRequest<{ Body: CreatePatient }>, reply: FastifyReply) => {
      const body = createPatientSchema.parse(request.body);
      const db = getDb(dbPath);
      const id = randomUUID();
      const now = new Date().toISOString();
      try {
        db.prepare(
          'INSERT INTO patients (id, created_at, name, pseudonymous_id, notes) VALUES (?, ?, ?, ?, ?)'
        ).run(id, now, body.name, body.pseudonymous_id, body.notes);
      } catch (error) {
        if ((error as Error & { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return reply.status(409).send({
            error: { code: 'CONFLICT', message: 'pseudonymous_id already exists' },
          });
        }
        throw error;
      }
      const row = db.prepare('SELECT * FROM patients WHERE id = ?').get(id) as Patient;
      return reply.status(201).send(row);
    }
  );

  fastify.put<{ Params: { id: string }; Body: UpdatePatient }>(
    '/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: UpdatePatient }>,
      reply: FastifyReply
    ) => {
      const body = updatePatientSchema.parse(request.body);
      const db = getDb(dbPath);
      const existing = db.prepare('SELECT * FROM patients WHERE id = ?').get(request.params.id) as
        | Patient
        | undefined;
      if (!existing) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Patient not found' } });
      }
      db.prepare('UPDATE patients SET name = ?, pseudonymous_id = ?, notes = ? WHERE id = ?').run(
        body.name,
        body.pseudonymous_id,
        body.notes,
        request.params.id
      );
      const row = db
        .prepare('SELECT * FROM patients WHERE id = ?')
        .get(request.params.id) as Patient;
      return reply.send(row);
    }
  );
}
