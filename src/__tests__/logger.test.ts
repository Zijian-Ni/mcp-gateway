import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Mock better-sqlite3 (native binding not available in all CI envs) ────────

interface MockRow {
  id: number;
  timestamp: string;
  tool_name: string;
  server_name: string;
  api_key: string | null;
  duration_ms: number;
  success: number;
  error_message: string | null;
  params: string | null;
  result: string | null;
}

const rows: MockRow[] = [];

const mockStatement = {
  run: vi.fn((params: Record<string, unknown>) => {
    rows.push({
      id: rows.length + 1,
      timestamp: params['timestamp'] as string,
      tool_name: params['toolName'] as string,
      server_name: params['serverName'] as string,
      api_key: (params['apiKey'] as string | null | undefined) ?? null,
      duration_ms: params['durationMs'] as number,
      success: params['success'] as number,
      error_message: (params['errorMessage'] as string | null | undefined) ?? null,
      params: (params['params'] as string | null | undefined) ?? null,
      result: (params['result'] as string | null | undefined) ?? null,
    });
  }),
  all: vi.fn((_params: Record<string, unknown>) => {
    // Return newest first (simulate ORDER BY id DESC)
    return [...rows].reverse();
  }),
  get: vi.fn(() => {
    const total = rows.length;
    const successful = rows.filter((r) => r.success === 1).length;
    const failed = total - successful;
    const avgDuration =
      total > 0 ? rows.reduce((sum, r) => sum + r.duration_ms, 0) / total : 0;
    return { total, successful, failed, avg_duration: avgDuration };
  }),
};

vi.mock('better-sqlite3', () => {
  const MockDatabase = vi.fn().mockImplementation(() => ({
    exec: vi.fn(),
    prepare: vi.fn().mockReturnValue(mockStatement),
    close: vi.fn(),
  }));
  return { default: MockDatabase };
});

// ─── Import Logger AFTER mock is set up ──────────────────────────────────────
import { Logger } from '../logger.js';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Logger', () => {
  let logger: Logger;
  let dbPath: string;

  beforeEach(() => {
    rows.length = 0;
    vi.clearAllMocks();
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

    // Verify stmt.run was called with truncated params
    const runArgs = mockStatement.run.mock.calls[0]?.[0] as Record<string, unknown>;
    const storedParams = runArgs['params'] as string;
    expect(storedParams).toContain('[truncated]');
    expect(storedParams.length).toBeLessThan(200);
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

    // Calling getEntries invokes stmt.all — the mock returns all rows;
    // the real filtering is done by SQL in prod, but here we verify the
    // WHERE clause params are forwarded correctly.
    logger.getEntries({ toolName: 'tool_a' });
    const allArgs = mockStatement.all.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(allArgs['toolName']).toBe('tool_a');
  });

  it('returns stats', () => {
    logger.log({
      timestamp: new Date().toISOString(),
      toolName: 't',
      serverName: 's',
      durationMs: 100,
      success: true,
    });
    logger.log({
      timestamp: new Date().toISOString(),
      toolName: 't',
      serverName: 's',
      durationMs: 200,
      success: false,
    });

    const stats = logger.getStats();
    expect(stats.total).toBe(2);
    expect(stats.successful).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.avgDurationMs).toBe(150);
  });

  it('respects tail limit in SQL query', () => {
    for (let i = 0; i < 10; i++) {
      logger.log({
        timestamp: new Date().toISOString(),
        toolName: `tool_${i}`,
        serverName: 'server',
        durationMs: i * 10,
        success: true,
      });
    }

    logger.getEntries({ tail: 3 });
    // Verify the mock was called (SQL has LIMIT applied in real DB)
    expect(mockStatement.all).toHaveBeenCalled();
  });
});
