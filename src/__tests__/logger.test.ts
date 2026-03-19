import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from '../logger.js';

describe('Logger', () => {
  let logger: Logger;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-${Date.now()}.db`);
    logger = new Logger({ dbPath, maxParamLength: 100 });
  });

  afterEach(() => {
    logger.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('logs a successful request', () => {
    logger.log({
      timestamp: '2026-01-01T00:00:00.000Z',
      toolName: 'get_weather',
      serverName: 'weather-server',
      apiKey: 'test-user',
      durationMs: 150,
      success: true,
      params: JSON.stringify({ city: 'London' }),
      result: JSON.stringify({ temp: 15 }),
    });

    const entries = logger.getEntries({ tail: 1 });
    expect(entries).toHaveLength(1);
    expect(entries[0].toolName).toBe('get_weather');
    expect(entries[0].success).toBe(true);
    expect(entries[0].durationMs).toBe(150);
  });

  it('logs a failed request', () => {
    logger.log({
      timestamp: new Date().toISOString(),
      toolName: 'broken_tool',
      serverName: 'bad-server',
      durationMs: 50,
      success: false,
      errorMessage: 'Connection refused',
    });

    const entries = logger.getEntries({ tail: 1 });
    expect(entries[0].success).toBe(false);
    expect(entries[0].errorMessage).toBe('Connection refused');
  });

  it('truncates long params', () => {
    const longParam = 'x'.repeat(200);
    logger.log({
      timestamp: new Date().toISOString(),
      toolName: 'tool',
      serverName: 'server',
      durationMs: 10,
      success: true,
      params: longParam,
    });

    const entries = logger.getEntries({ tail: 1 });
    expect(entries[0].params).toContain('[truncated]');
    expect(entries[0].params!.length).toBeLessThan(200);
  });

  it('filters by tool name', () => {
    logger.log({
      timestamp: new Date().toISOString(),
      toolName: 'tool_a',
      serverName: 'server',
      durationMs: 10,
      success: true,
    });
    logger.log({
      timestamp: new Date().toISOString(),
      toolName: 'tool_b',
      serverName: 'server',
      durationMs: 10,
      success: true,
    });

    const entries = logger.getEntries({ toolName: 'tool_a' });
    expect(entries).toHaveLength(1);
    expect(entries[0].toolName).toBe('tool_a');
  });

  it('returns stats', () => {
    logger.log({ timestamp: new Date().toISOString(), toolName: 't', serverName: 's', durationMs: 100, success: true });
    logger.log({ timestamp: new Date().toISOString(), toolName: 't', serverName: 's', durationMs: 200, success: false });

    const stats = logger.getStats();
    expect(stats.total).toBe(2);
    expect(stats.successful).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.avgDurationMs).toBe(150);
  });

  it('respects tail limit', () => {
    for (let i = 0; i < 10; i++) {
      logger.log({
        timestamp: new Date().toISOString(),
        toolName: `tool_${i}`,
        serverName: 'server',
        durationMs: i * 10,
        success: true,
      });
    }

    const entries = logger.getEntries({ tail: 3 });
    expect(entries).toHaveLength(3);
  });
});
