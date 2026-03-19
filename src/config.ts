/**
 * YAML config parser + validation with env var resolution
 */

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import type { GatewayConfig } from './types.js';

// Zod schema for validation
const upstreamServerSchema = z.object({
  name: z.string().min(1),
  transport: z.enum(['stdio', 'sse', 'http']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  url: z.string().url().optional(),
  description: z.string().optional(),
  timeout: z.number().positive().optional(),
}).refine(
  (s) => {
    if (s.transport === 'stdio' && !s.command) return false;
    if ((s.transport === 'sse' || s.transport === 'http') && !s.url) return false;
    return true;
  },
  {
    message: 'stdio transport requires "command"; sse/http transport requires "url"',
  }
);

const apiKeySchema = z.object({
  key: z.string().min(8),
  name: z.string().min(1),
  allowedTools: z.array(z.string()).optional(),
  allowedServers: z.array(z.string()).optional(),
  rateLimit: z.number().positive().optional(),
});

const rateLimitSchema = z.object({
  tokensPerMinute: z.number().positive().default(60),
  burstSize: z.number().positive().default(10),
});

const cacheSchema = z.object({
  enabled: z.boolean().default(true),
  maxSize: z.number().positive().default(1000),
  ttlSeconds: z.number().positive().default(300),
});

const loggingSchema = z.object({
  dbPath: z.string().default('./mcp-gateway.db'),
  maxParamLength: z.number().positive().default(500),
});

const gatewayConfigSchema = z.object({
  gateway: z.object({
    port: z.number().min(1).max(65535).default(3000),
    host: z.string().default('127.0.0.1'),
    requireAuth: z.boolean().default(true),
  }),
  servers: z.array(upstreamServerSchema).min(1),
  apiKeys: z.array(apiKeySchema).default([]),
  rateLimit: rateLimitSchema.default({}),
  cache: cacheSchema.default({}),
  logging: loggingSchema.default({}),
});

/**
 * Resolve ${VAR} and ${VAR:-default} syntax in strings
 */
function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, expr) => {
    const [varName, defaultValue] = expr.split(':-');
    const resolved = process.env[varName.trim()];
    if (resolved !== undefined) return resolved;
    if (defaultValue !== undefined) return defaultValue;
    console.warn(`Warning: environment variable ${varName} is not set`);
    return match;
  });
}

/**
 * Recursively resolve env vars in any object/string
 */
function deepResolveEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return resolveEnvVars(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(deepResolveEnvVars);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = deepResolveEnvVars(val);
    }
    return result;
  }
  return obj;
}

/**
 * Load and validate configuration from a YAML file
 */
export function loadConfig(configPath: string): GatewayConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  let parsed: unknown;

  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new Error(`Failed to parse YAML config: ${(err as Error).message}`);
  }

  // Resolve environment variables before validation
  const resolved = deepResolveEnvVars(parsed);

  // Validate with Zod
  const result = gatewayConfigSchema.safeParse(resolved);
  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Config validation failed:\n${errors}`);
  }

  return result.data as GatewayConfig;
}

/**
 * Validate config without loading (for CLI validate command)
 */
export function validateConfig(configPath: string): { valid: boolean; errors: string[] } {
  try {
    loadConfig(configPath);
    return { valid: true, errors: [] };
  } catch (err) {
    return { valid: false, errors: [(err as Error).message] };
  }
}

export { gatewayConfigSchema };
