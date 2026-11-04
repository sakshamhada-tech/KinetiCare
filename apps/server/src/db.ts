import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

/* ------------------------------------------------------------------ */
/* Connection                                                         */
/* ------------------------------------------------------------------ */

/* Connections are keyed by resolved path so tests can open several
 * distinct databases without receiving a stale cached handle. */
const connections = new Map<string, Database.Database>();

export function getDb(dbPath: string): Database.Database {
  const resolved = path.resolve(dbPath);
  let db = connections.get(resolved);
  if (!db) {
    db = new Database(resolved);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    connections.set(resolved, db);
  }
  return db;
}

export function closeDb(dbPath?: string): void {
  if (dbPath) {
    const resolved = path.resolve(dbPath);
    const db = connections.get(resolved);
    if (db) {
      db.close();
      connections.delete(resolved);
    }
    return;
  }
  for (const [, db] of connections) db.close();
  connections.clear();
}

/* ------------------------------------------------------------------ */
/* Migrations                                                         */
/* ------------------------------------------------------------------ */

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export function loadMigrations(migrationsDir: string): Migration[] {
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
  const migrations: Migration[] = [];
  for (const file of files) {
    const match = /^(\d+)__(.+)\.sql$/.exec(file);
    if (!match) continue;
    migrations.push({
      version: Number(match[1]),
      name: match[2] ?? '',
      sql: fs.readFileSync(path.join(migrationsDir, file), 'utf8'),
    });
  }
  return migrations.sort((a, b) => a.version - b.version);
}

export function ensureMigrationTable(db: Database.Database): void {
  db.prepare(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();
}

export function getAppliedVersions(db: Database.Database): number[] {
  const rows = db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[];
  return rows.map((r) => r.version);
}

export function migrate(db: Database.Database, migrationsDir: string): { applied: number[] } {
  ensureMigrationTable(db);
  const migrations = loadMigrations(migrationsDir);
  const applied = getAppliedVersions(db);
  const appliedSet = new Set(applied);
  const pending = migrations.filter((m) => !appliedSet.has(m.version));

  // Split a migration file into individual statements (naive split on ';',
  // sufficient for our DDL-only migrations which contain no semicolons inside
  // string literals or triggers).
  function splitStatements(sql: string): string[] {
    return sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  const tx = db.transaction(() => {
    for (const m of pending) {
      for (const stmt of splitStatements(m.sql)) {
        db.prepare(stmt).run();
      }
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
        m.version,
        m.name
      );
    }
  });
  tx();

  return { applied: pending.map((m) => m.version) };
}
