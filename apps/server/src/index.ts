import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fastify from 'fastify';
import { z } from 'zod';
import { migrate, getDb } from './db.js';
import exerciseRoutes from './routes/exercises.js';
import patientRoutes from './routes/patients.js';
import routineRoutes from './routes/routines.js';
import sessionRoutes from './routes/sessions.js';
import { createReportGenerator } from './services/report-generator.js';
import { ZodError } from 'zod';

/* ------------------------------------------------------------------ */
/* Environment validation                                             */
/* ------------------------------------------------------------------ */

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().default('127.0.0.1'),
  APP_ORIGIN: z.string().url().default('http://127.0.0.1:5173'),
  DB_PATH: z.string().default('./data/kineticare.db'),
  OLLAMA_BASE_URL: z.string().url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().min(1).default('llama3:8b-instruct'),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
});

type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('[kineticare] Invalid environment:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

/* ------------------------------------------------------------------ */
/* Server                                                             */
/* ------------------------------------------------------------------ */

export async function buildServer(env?: Env) {
  const configuration = env ?? loadEnv();

  const isPublicHost = configuration.HOST !== '127.0.0.1' && configuration.HOST !== 'localhost';
  if (isPublicHost) {
    console.warn(
      `[kineticare] WARNING: server binding to non-loopback host ${configuration.HOST}. ` +
        'This exposes the local API and patient data. Use 127.0.0.1 in production.'
    );
  }

  const app = fastify({
    logger: {
      // Log hygiene: never log patient names, notes, or report contents at info level.
      redact: ['req.headers.authorization', 'body.name', 'body.notes', 'body.content_json'],
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
    // Bind to loopback by default.
    ...(configuration.HOST ? { host: configuration.HOST } : {}),
  });

  // Resolve DB path relative to cwd (so `npm run start` from repo root works).
  const dbPath = path.resolve(configuration.DB_PATH);

  // Open DB + run forward-only migrations.
  const db = getDb(dbPath);
  const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
  const { applied } = migrate(db, migrationsDir);
  if (applied.length > 0) {
    console.log(`[kineticare] migrations applied: ${applied.join(', ')}`);
  }

  app.setErrorHandler((error, request, reply) => {
    request.log.warn(error as Error, 'request error');
    // Validation errors -> 400 with the error envelope.
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
          details: error.flatten().fieldErrors,
        },
      });
    }
    const statusCode = (error as Error & { statusCode?: number }).statusCode ?? 500;
    const message = statusCode >= 500 ? 'Internal server error' : (error as Error).message;
    return reply.status(statusCode).send({
      error: { code: 'ERR_SERVER', message, details: undefined },
    });
  });

  // CORS locked to the app origin only.
  await app.register(import('@fastify/cors'), {
    origin: configuration.APP_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  });

  // Health endpoint (no patient data, safe to poll).
  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'kineticare-server',
    host: configuration.HOST,
    port: configuration.PORT,
  }));

  // Report generator (Ollama with template fallback).
  const reportGenerator = createReportGenerator(
    configuration.OLLAMA_BASE_URL,
    configuration.OLLAMA_MODEL,
    configuration.OLLAMA_TIMEOUT_MS
  );

  // Consistent error envelope for unmatched routes.
  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  // API routes.
  await app.register(exerciseRoutes, { prefix: '/api/exercises', dbPath });
  await app.register(patientRoutes, { prefix: '/api/patients', dbPath });
  await app.register(routineRoutes, { prefix: '/api/routines', dbPath });
  await app.register(sessionRoutes, {
    prefix: '/api/sessions',
    dbPath,
    reportGenerator,
  });

  app.get('/api/_routes', async () => [
    { path: '/api/health', method: 'GET' },
    { path: '/api/exercises', method: 'GET' },
    { path: '/api/patients', method: 'GET' },
    { path: '/api/routines', method: 'GET' },
    { path: '/api/sessions', method: 'GET' },
  ]);

  return { app, configuration };
}

export type { Env };
