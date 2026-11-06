import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { migrate, getDb, closeDb, loadMigrations } from '../src/db.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

describe('db connection lifecycle', () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(__dirname, '..', 'data', `dbtest-${randomUUID()}.db`);
  });

  afterEach(() => {
    closeDb(dbPath);
  });

  it('closeDb() with no path closes all cached connections', () => {
    const db = getDb(dbPath);
    migrate(db, path.join(__dirname, '..', 'src', 'migrations'));
    // A second handle for the same path returns the cached connection.
    const same = getDb(dbPath);
    expect(same).toBe(db);
    // closeDb() with no argument closes every cached connection.
    closeDb();
    // A fresh getDb after a full close returns a new (not closed) handle.
    const again = getDb(dbPath);
    expect(again).not.toBe(db);
    closeDb(dbPath);
  });

  it('getDb caches the connection by resolved path', () => {
    const a = getDb(dbPath);
    const b = getDb(dbPath);
    expect(a).toBe(b);
    closeDb(dbPath);
  });
});

describe('loadMigrations', () => {
  let dir: string;

  beforeEach(() => {
    dir = path.join(__dirname, '..', 'data', `migrations-${randomUUID()}`);
    fs.mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('skips migration files that do not match the version__name pattern', () => {
    fs.writeFileSync(path.join(dir, '01__initial.sql'), 'CREATE TABLE t(x);');
    fs.writeFileSync(path.join(dir, 'not-a-migration.sql'), 'SELECT 1;'); // no version__
    fs.writeFileSync(path.join(dir, 'README.md'), '# not sql');
    const migrations = loadMigrations(dir);
    expect(migrations).toHaveLength(1);
    expect(migrations[0].version).toBe(1);
  });
});
