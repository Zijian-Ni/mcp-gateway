/**
 * Core gateway class - manages upstream MCP server lifecycle and proxies tool calls
 */

import * as http from 'http';
import type { GatewayConfig, ToolInfo, GatewayStats, ApiKeyConfig } from './types.js';
import { Router } from './router.js';
import { AuthManager } from './auth.js';
import { Logger } from './logger.js';
import { Cache } from './cache.js';
import { RateLimiter } from './rate-limiter.js';
import { StdioTransportAdapter } from './transports/stdio.js';
import { SSETransportAdapter } from './transports/sse.js';
import { HTTPTransportAdapter } from './transports/http.js';

type UpstreamAdapter = StdioTransportAdapter | SSETransportAdapter | HTTPTransportAdapter;

export class Gateway {
  private config: GatewayConfig;
  private router: Router;
  private auth: AuthManager;
  private logger: Logger;
  private cache: Cache;
  private rateLimiter: RateLimiter;
  private adapters: Map<string, UpstreamAdapter>;
  private server: http.Server | null = null;
  private startTime: number;
  private requestCount = { total: 0, successful: 0, failed: 0 };
  private pruneInterval: NodeJS.Timeout | null = null;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.startTime = Date.now();
    this.adapters = new Map();
    this.router = new Router();
    this.auth = new AuthManager(config.apiKeys, config.gateway.requireAuth);
    this.logger = new Logger(config.logging);
    this.cache = new Cache(config.cache);
    this.rateLimiter = new RateLimiter(config.rateLimit);

    // Apply per-key rate limit overrides
    for (const key of config.apiKeys) {
      if (key.rateLimit) {
        this.rateLimiter.setOverride(key.key, key.rateLimit);
      }
    }
  }

  /**
   * Connect to all configured upstream MCP servers and discover their tools
   */
  async start(): Promise<void> {
    console.log('[Gateway] Starting mcp-gateway...');

    // Connect to all upstream servers
    const connectPromises = this.config.servers.map(async (serverConfig) => {
      let adapter: UpstreamAdapter;

      switch (serverConfig.transport) {
        case 'stdio':
          adapter = new StdioTransportAdapter(serverConfig);
          break;
        case 'sse':
          adapter = new SSETransportAdapter(serverConfig);
          break;
        case 'http':
          adapter = new HTTPTransportAdapter(serverConfig);
          break;
        default:
          console.error(`[Gateway] Unknown transport type for server "${serverConfig.name}"`);
          return;
      }

      try {
        await adapter.connect();
        this.adapters.set(serverConfig.name, adapter);

        // Discover tools
        const tools = await adapter.discoverTools();
        this.router.registerAll(tools);
        console.log(
          `[Gateway] Registered ${tools.length} tools from "${serverConfig.name}": ${tools.map((t) => t.name).join(', ')}`
        );
      } catch (err) {
        console.error(
          `[Gateway] Failed to connect to server "${serverConfig.name}": ${(err as Error).message}`
        );
      }
    });

    await Promise.all(connectPromises);

    console.log(
      `[Gateway] Connected to ${this.adapters.size}/${this.config.servers.length} servers. ` +
        `Total tools: ${this.router.size}`
    );

    // Start the HTTP gateway server
    await this.startHttpServer();

    // Periodic maintenance
    this.pruneInterval = setInterval(() => {
      this.rateLimiter.prune();
      this.cache.purgeExpired();
    }, 60000);
  }

  /**
   * Start the HTTP gateway server that accepts tool call requests
   */
  private async startHttpServer(): Promise<void> {
    const { host, port } = this.config.gateway;

    this.server = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(port, host, () => {
        console.log(`[Gateway] Listening on http://${host}:${port}`);
        resolve();
      });
      this.server!.on('error', reject);
    });
  }

  /**
   * Handle an incoming HTTP request
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check
    if (pathname === '/health') {
      this.sendJson(res, 200, { status: 'ok', uptime: Date.now() - this.startTime });
      return;
    }

    // Stats endpoint
    if (pathname === '/stats') {
      this.sendJson(res, 200, this.getStats());
      return;
    }

    // List tools
    if (pathname === '/tools' && req.method === 'GET') {
      const apiKey = this.getApiKey(req);
      const keyConfig = this.auth.validateKey(apiKey);
      if (!keyConfig) {
        this.sendJson(res, 401, { error: 'Unauthorized' });
        return;
      }
      this.sendJson(res, 200, { tools: this.router.listTools() });
      return;
    }

    // Call tool
    if (pathname === '/call' && req.method === 'POST') {
      await this.handleToolCall(req, res);
      return;
    }

    this.sendJson(res, 404, { error: 'Not found' });
  }

  /**
   * Handle a tool call request
   */
  private async handleToolCall(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const startTime = Date.now();
    let toolName = '';
    let serverName = '';
    let keyConfig: ApiKeyConfig | null = null;
    const apiKeyHeader = this.getApiKey(req);

    try {
      // Auth
      keyConfig = this.auth.validateKey(apiKeyHeader);
      if (!keyConfig) {
        this.requestCount.failed++;
        this.sendJson(res, 401, { error: 'Unauthorized: invalid or missing API key' });
        return;
      }

      // Rate limiting
      const rateLimitKey = keyConfig.key;
      if (!this.rateLimiter.consume(rateLimitKey)) {
        this.requestCount.failed++;
        this.sendJson(res, 429, {
          error: 'Rate limit exceeded',
          remaining: this.rateLimiter.remaining(rateLimitKey),
        });
        return;
      }

      // Parse body
      const body = await this.readBody(req);
      const payload = JSON.parse(body) as { tool: string; params?: Record<string, unknown> };

      toolName = payload.tool;
      const params = payload.params ?? {};

      if (!toolName) {
        this.sendJson(res, 400, { error: 'Missing required field: tool' });
        return;
      }

      // Route
      const route = this.router.resolve(toolName);
      if (!route) {
        this.requestCount.failed++;
        this.sendJson(res, 404, { error: `Unknown tool: ${toolName}` });
        return;
      }

      serverName = route.serverName;

      // Permission check
      if (!this.auth.isAllowed(keyConfig, toolName, serverName)) {
        this.requestCount.failed++;
        this.sendJson(res, 403, { error: `Access denied to tool "${toolName}"` });
        return;
      }

      // Check cache
      const cacheKey = Cache.buildKey(toolName, params);
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) {
        this.requestCount.successful++;
        this.requestCount.total++;
        this.sendJson(res, 200, { result: cached, cached: true });
        return;
      }

      // Get adapter
      const adapter = this.adapters.get(serverName);
      if (!adapter) {
        this.requestCount.failed++;
        this.sendJson(res, 503, { error: `Server "${serverName}" is not connected` });
        return;
      }

      // Call tool
      const result = await adapter.callTool(toolName, params);

      // Cache the result
      this.cache.set(cacheKey, result);

      const durationMs = Date.now() - startTime;
      this.requestCount.total++;
      this.requestCount.successful++;

      // Log
      this.logger.log({
        timestamp: new Date().toISOString(),
        toolName,
        serverName,
        apiKey: keyConfig.name,
        durationMs,
        success: true,
        params: JSON.stringify(params),
        result: JSON.stringify(result),
      });

      this.sendJson(res, 200, { result, durationMs });
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.requestCount.total++;
      this.requestCount.failed++;

      const errorMessage = (err as Error).message;
      console.error(`[Gateway] Error calling tool "${toolName}": ${errorMessage}`);

      if (toolName && serverName) {
        this.logger.log({
          timestamp: new Date().toISOString(),
          toolName,
          serverName,
          apiKey: keyConfig?.name,
          durationMs,
          success: false,
          errorMessage,
        });
      }

      this.sendJson(res, 500, { error: errorMessage });
    }
  }

  /**
   * Call a tool programmatically (for use as a library)
   */
  async callTool(
    toolName: string,
    params: Record<string, unknown> = {},
    options: { apiKey?: string; bypassCache?: boolean } = {}
  ): Promise<unknown> {
    const startTime = Date.now();
    const keyConfig = this.auth.validateKey(options.apiKey);
    if (!keyConfig) throw new Error('Unauthorized: invalid API key');

    const route = this.router.resolve(toolName);
    if (!route) throw new Error(`Unknown tool: ${toolName}`);

    if (!this.auth.isAllowed(keyConfig, toolName, route.serverName)) {
      throw new Error(`Access denied to tool "${toolName}"`);
    }

    if (!options.bypassCache) {
      const cacheKey = Cache.buildKey(toolName, params);
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) return cached;
    }

    const adapter = this.adapters.get(route.serverName);
    if (!adapter) throw new Error(`Server "${route.serverName}" is not connected`);

    const result = await adapter.callTool(toolName, params);

    if (!options.bypassCache) {
      this.cache.set(Cache.buildKey(toolName, params), result);
    }

    const durationMs = Date.now() - startTime;
    this.logger.log({
      timestamp: new Date().toISOString(),
      toolName,
      serverName: route.serverName,
      apiKey: keyConfig.name,
      durationMs,
      success: true,
      params: JSON.stringify(params),
      result: JSON.stringify(result),
    });

    return result;
  }

  /**
   * Get all registered tools
   */
  listTools(): ToolInfo[] {
    return this.router.listTools();
  }

  /**
   * Get gateway statistics
   */
  getStats(): GatewayStats {
    return {
      uptime: Date.now() - this.startTime,
      totalRequests: this.requestCount.total,
      successfulRequests: this.requestCount.successful,
      failedRequests: this.requestCount.failed,
      servers: this.config.servers.map((s) => ({
        name: s.name,
        connected: this.adapters.has(s.name),
        toolCount: this.router.getServerTools(s.name).length,
      })),
    };
  }

  /**
   * Gracefully stop the gateway
   */
  async stop(): Promise<void> {
    console.log('[Gateway] Shutting down...');

    if (this.pruneInterval) {
      clearInterval(this.pruneInterval);
    }

    // Close HTTP server
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
    }

    // Disconnect all upstream servers
    const disconnectPromises = Array.from(this.adapters.values()).map((adapter) =>
      adapter.disconnect().catch((err) =>
        console.error(`[Gateway] Error disconnecting: ${(err as Error).message}`)
      )
    );

    await Promise.all(disconnectPromises);
    this.logger.close();
    console.log('[Gateway] Stopped.');
  }

  private getApiKey(req: http.IncomingMessage): string | undefined {
    const authHeader = req.headers['authorization'];
    const xApiKey = req.headers['x-api-key'];
    return (authHeader as string) ?? (xApiKey as string);
  }

  private sendJson(res: http.ServerResponse, status: number, data: unknown): void {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }
}
