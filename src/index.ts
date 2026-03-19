#!/usr/bin/env node
/**
 * mcp-gateway CLI entry point
 * Provides: mcpx start | list-tools | logs | config validate
 */

import { Command } from 'commander';
import * as path from 'path';
import { loadConfig, validateConfig } from './config.js';
import { Gateway } from './gateway.js';
import { Logger } from './logger.js';

const program = new Command();

program
  .name('mcpx')
  .description('MCP Gateway — unified routing, auth, logging, and rate limiting for MCP servers')
  .version('0.1.0');

// ─── mcpx start ────────────────────────────────────────────────────────────

program
  .command('start')
  .description('Start the MCP gateway')
  .option('-c, --config <path>', 'Path to config file', './config.yaml')
  .action(async (options: { config: string }) => {
    const configPath = path.resolve(options.config);
    console.log(`[mcpx] Loading config from: ${configPath}`);

    let config;
    try {
      config = loadConfig(configPath);
    } catch (err) {
      console.error(`[mcpx] Config error: ${(err as Error).message}`);
      process.exit(1);
    }

    const gateway = new Gateway(config);

    // Graceful shutdown
    const shutdown = async (): Promise<void> => {
      console.log('\n[mcpx] Shutting down...');
      await gateway.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => { void shutdown(); });
    process.on('SIGTERM', () => { void shutdown(); });

    try {
      await gateway.start();
      console.log('[mcpx] Gateway is running. Press Ctrl+C to stop.');
    } catch (err) {
      console.error(`[mcpx] Failed to start gateway: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── mcpx list-tools ───────────────────────────────────────────────────────

program
  .command('list-tools')
  .description('List all tools available across configured upstream servers')
  .option('-c, --config <path>', 'Path to config file', './config.yaml')
  .option('--json', 'Output as JSON')
  .action(async (options: { config: string; json?: boolean }) => {
    const configPath = path.resolve(options.config);

    let config;
    try {
      config = loadConfig(configPath);
    } catch (err) {
      console.error(`[mcpx] Config error: ${(err as Error).message}`);
      process.exit(1);
    }

    const gateway = new Gateway(config);

    try {
      await gateway.start();
      const tools = gateway.listTools();

      if (options.json) {
        console.log(JSON.stringify(tools, null, 2));
      } else {
        console.log(`\nFound ${tools.length} tools:\n`);
        for (const tool of tools) {
          console.log(`  ▸ ${tool.name}`);
          if (tool.description) {
            console.log(`    ${tool.description}`);
          }
          console.log(`    Server: ${tool.serverName}`);
          console.log();
        }
      }

      await gateway.stop();
    } catch (err) {
      console.error(`[mcpx] Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── mcpx logs ─────────────────────────────────────────────────────────────

program
  .command('logs')
  .description('View request logs from the SQLite database')
  .option('-c, --config <path>', 'Path to config file', './config.yaml')
  .option('-n, --tail <number>', 'Show last N log entries', '20')
  .option('--tool <name>', 'Filter by tool name')
  .option('--server <name>', 'Filter by server name')
  .option('--json', 'Output as JSON')
  .action((options: { config: string; tail: string; tool?: string; server?: string; json?: boolean }) => {
    const configPath = path.resolve(options.config);

    let config;
    try {
      config = loadConfig(configPath);
    } catch (err) {
      console.error(`[mcpx] Config error: ${(err as Error).message}`);
      process.exit(1);
    }

    const logger = new Logger(config.logging);
    const entries = logger.getEntries({
      tail: parseInt(options.tail, 10),
      toolName: options.tool,
      serverName: options.server,
    });

    if (options.json) {
      console.log(JSON.stringify(entries, null, 2));
    } else {
      if (entries.length === 0) {
        console.log('No log entries found.');
      } else {
        console.log(`\nShowing ${entries.length} log entries (newest first):\n`);
        for (const entry of entries) {
          const status = entry.success ? '✓' : '✗';
          const statusColor = entry.success ? '\x1b[32m' : '\x1b[31m';
          const reset = '\x1b[0m';

          console.log(
            `${statusColor}${status}${reset} [${entry.timestamp}] ${entry.toolName} → ${entry.serverName} ` +
              `(${entry.durationMs}ms)` +
              (entry.apiKey ? ` [key: ${entry.apiKey}]` : '')
          );

          if (!entry.success && entry.errorMessage) {
            console.log(`  Error: ${entry.errorMessage}`);
          }
        }

        const stats = logger.getStats();
        console.log(
          `\nTotal: ${stats.total} | ✓ ${stats.successful} | ✗ ${stats.failed} | Avg: ${stats.avgDurationMs}ms`
        );
      }
    }

    logger.close();
  });

// ─── mcpx config validate ──────────────────────────────────────────────────

program
  .command('config')
  .description('Config management commands')
  .command('validate')
  .description('Validate the config file')
  .option('-c, --config <path>', 'Path to config file', './config.yaml')
  .action((options: { config: string }) => {
    const configPath = path.resolve(options.config);
    console.log(`Validating config: ${configPath}`);

    const { valid, errors } = validateConfig(configPath);

    if (valid) {
      console.log('✓ Config is valid');
      process.exit(0);
    } else {
      console.error('✗ Config validation failed:');
      for (const error of errors) {
        console.error(`  ${error}`);
      }
      process.exit(1);
    }
  });

program.parse(process.argv);
