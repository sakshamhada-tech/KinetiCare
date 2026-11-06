import { describe, expect, it, afterEach, vi } from 'vitest';
import { buildServer } from '../src/index.js';
import { closeDb } from '../src/db.js';
import path from 'node:path';

describe('buildServer', () => {
  const dbPath = path.join(__dirname, '..', 'data', `indextest-${Date.now()}.db`);

  afterEach(() => {
    closeDb(dbPath);
  });

  it('warns when binding to a non-loopback host', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { app, configuration } = await buildServer({
        NODE_ENV: 'test',
        PORT: 0,
        HOST: '0.0.0.0',
        APP_ORIGIN: 'http://127.0.0.1:5173',
        DB_PATH: dbPath,
        OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
        OLLAMA_MODEL: 'llama3:8b-instruct',
        OLLAMA_TIMEOUT_MS: 5000,
      });
      expect(configuration.HOST).toBe('0.0.0.0');
      expect(app).toBeDefined();
      await app.close();
    } finally {
      warn.mockRestore();
    }
  });

  it('loadEnv error path exits on invalid env', async () => {
    const originalPort = process.env.PORT;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    try {
      process.env.PORT = 'not-a-number';
      await expect(buildServer()).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      process.env.PORT = originalPort;
      exitSpy.mockRestore();
    }
  });

  it('omits the host option when HOST is falsy', async () => {
    const { app, configuration } = await buildServer({
      NODE_ENV: 'test',
      PORT: 0,
      HOST: undefined,
      APP_ORIGIN: 'http://127.0.0.1:5173',
      DB_PATH: dbPath,
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
      OLLAMA_MODEL: 'llama3:8b-instruct',
      OLLAMA_TIMEOUT_MS: 5000,
    });
    expect(configuration.HOST).toBeUndefined();
    expect(app).toBeDefined();
    await app.close();
  });
});
