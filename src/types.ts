/**
 * Shared type definitions for mcp-gateway
 */

export interface UpstreamServerConfig {
  /** Unique identifier for this server */
  name: string;
  /** Transport type */
  transport: 'stdio' | 'sse' | 'http';
  /** For stdio: command to run */
  command?: string;
  /** For stdio: arguments to pass to command */
  args?: string[];
  /** For stdio: environment variables */
  env?: Record<string, string>;
  /** For sse/http: base URL of the server */
  url?: string;
  /** Optional description */
  description?: string;
  /** Timeout for tool calls in ms (default: 30000) */
  timeout?: number;
}

export interface ApiKeyConfig {
  /** The API key value */
  key: string;
  /** Human-readable name */
  name: string;
  /** List of allowed tool names (empty = all allowed) */
  allowedTools?: string[];
  /** List of allowed server names (empty = all allowed) */
  allowedServers?: string[];
  /** Rate limit override (tokens per minute) */
  rateLimit?: number;
}

export interface RateLimitConfig {
  /** Tokens per minute (default: 60) */
  tokensPerMinute: number;
  /** Max burst size (default: 10) */
  burstSize: number;
}

export interface CacheConfig {
  /** Enable response caching */
  enabled: boolean;
  /** Max number of entries */
  maxSize: number;
  /** Time to live in seconds */
  ttlSeconds: number;
}

export interface LoggingConfig {
  /** SQLite database file path */
  dbPath: string;
  /** Max parameter length before truncation */
  maxParamLength: number;
}

export interface GatewayConfig {
  /** Gateway server settings */
  gateway: {
    /** Port to listen on (for HTTP/SSE clients) */
    port: number;
    /** Host to bind to */
    host: string;
    /** Require API key authentication */
    requireAuth: boolean;
  };
  /** Upstream MCP servers */
  servers: UpstreamServerConfig[];
  /** API keys for authentication */
  apiKeys: ApiKeyConfig[];
  /** Rate limiting configuration */
  rateLimit: RateLimitConfig;
  /** Response caching */
  cache: CacheConfig;
  /** Request logging */
  logging: LoggingConfig;
}

export interface ToolInfo {
  /** Tool name (from MCP server) */
  name: string;
  /** Tool description */
  description?: string;
  /** JSON Schema for input */
  inputSchema: Record<string, unknown>;
  /** Which upstream server hosts this tool */
  serverName: string;
}

export interface RouteEntry {
  /** Tool name */
  toolName: string;
  /** Target server name */
  serverName: string;
  /** Full tool info */
  tool: ToolInfo;
}

export interface LogEntry {
  id?: number;
  timestamp: string;
  toolName: string;
  serverName: string;
  apiKey?: string;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  params?: string;
  result?: string;
}

export interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export interface CacheEntry {
  result: unknown;
  expiresAt: number;
}

export interface GatewayStats {
  uptime: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  servers: {
    name: string;
    connected: boolean;
    toolCount: number;
  }[];
}
