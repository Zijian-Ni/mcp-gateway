/**
 * SQLite request logger using better-sqlite3
 */

import Database from 'better-sqlite3';
import type { LogEntry, LoggingConfig } from './types.js';

export class Logger {
  private db: Database.Database;
  private config: LoggingConfig;

  constructor(config: LoggingConfig) {
    this.config = config;
    this.db = new Database(config.dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        server_name TEXT NOT NULL,
        api_key TEXT,
        duration_ms INTEGER NOT NULL,
        success INTEGER NOT NULL,
        error_message TEXT,
        params TEXT,
        result TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp);
      CREATE INDEX IF NOT EXISTS idx_requests_tool_name ON requests(tool_name);
      CREATE INDEX IF NOT EXISTS idx_requests_api_key ON requests(api_key);
    `);
  }

  /**
   * Log a tool call to SQLite
   */
  log(entry: LogEntry): void {
    const stmt = this.db.prepare(`
      INSERT INTO requests (timestamp, tool_name, server_name, api_key, duration_ms, success, error_message, params, result)
      VALUES (@timestamp, @toolName, @serverName, @apiKey, @durationMs, @success, @errorMessage, @params, @result)
    `);

    stmt.run({
      timestamp: entry.timestamp,
      toolName: entry.toolName,
      serverName: entry.serverName,
      apiKey: entry.apiKey ?? null,
      durationMs: entry.durationMs,
      success: entry.success ? 1 : 0,
      errorMessage: entry.errorMessage ?? null,
      params: entry.params ? this.truncate(entry.params) : null,
      result: entry.result ? this.truncate(entry.result) : null,
    });
  }

  /**
   * Truncate a string to the configured max length
   */
  private truncate(str: string): string {
    if (str.length <= this.config.maxParamLength) return str;
    return str.slice(0, this.config.maxParamLength) + '...[truncated]';
  }

  /**
   * Get recent log entries
   */
  getEntries(options: { tail?: number; toolName?: string; serverName?: string } = {}): LogEntry[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (options.toolName) {
      conditions.push('tool_name = @toolName');
      params['toolName'] = options.toolName;
    }

    if (options.serverName) {
      conditions.push('server_name = @serverName');
      params['serverName'] = options.serverName;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.tail ? `LIMIT ${options.tail}` : '';

    const rows = this.db
      .prepare(
        `SELECT id, timestamp, tool_name, server_name, api_key, duration_ms, success, error_message, params, result
         FROM requests
         ${where}
         ORDER BY id DESC
         ${limit}`
      )
      .all(params) as Array<{
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
      }>;

    return rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      toolName: row.tool_name,
      serverName: row.server_name,
      apiKey: row.api_key ?? undefined,
      durationMs: row.duration_ms,
      success: row.success === 1,
      errorMessage: row.error_message ?? undefined,
      params: row.params ?? undefined,
      result: row.result ?? undefined,
    }));
  }

  /**
   * Get aggregate statistics
   */
  getStats(): { total: number; successful: number; failed: number; avgDurationMs: number } {
    const row = this.db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(success) as successful,
           COUNT(*) - SUM(success) as failed,
           AVG(duration_ms) as avg_duration
         FROM requests`
      )
      .get() as { total: number; successful: number; failed: number; avg_duration: number };

    return {
      total: row.total ?? 0,
      successful: row.successful ?? 0,
      failed: row.failed ?? 0,
      avgDurationMs: Math.round(row.avg_duration ?? 0),
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
