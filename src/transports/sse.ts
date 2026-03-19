/**
 * SSE transport adapter for connecting to MCP servers over Server-Sent Events
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { UpstreamServerConfig, ToolInfo } from '../types.js';

export class SSETransportAdapter {
  private client: Client;
  private transport: SSEClientTransport | null = null;
  private config: UpstreamServerConfig;
  private connected = false;

  constructor(config: UpstreamServerConfig) {
    if (!config.url) {
      throw new Error(`SSE transport requires "url" for server "${config.name}"`);
    }

    this.config = config;
    this.client = new Client(
      { name: 'mcp-gateway', version: '0.1.0' },
      { capabilities: {} }
    );
  }

  /**
   * Connect to the SSE endpoint
   */
  async connect(): Promise<void> {
    const sseUrl = new URL(this.config.url!);

    this.transport = new SSEClientTransport(sseUrl);
    await this.client.connect(this.transport);
    this.connected = true;
    console.log(`[SSE] Connected to "${this.config.name}" at ${this.config.url}`);
  }

  /**
   * Discover all tools from this server
   */
  async discoverTools(): Promise<ToolInfo[]> {
    if (!this.connected) throw new Error(`Not connected to server "${this.config.name}"`);

    const response = await this.client.listTools();
    return response.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
      serverName: this.config.name,
    }));
  }

  /**
   * Call a tool and return the result
   */
  async callTool(
    toolName: string,
    params: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<unknown> {
    if (!this.connected) throw new Error(`Not connected to server "${this.config.name}"`);

    const timeout = timeoutMs ?? this.config.timeout ?? 30000;

    const result = await Promise.race([
      this.client.callTool({ name: toolName, arguments: params }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Tool call timed out after ${timeout}ms`)), timeout)
      ),
    ]);

    return result;
  }

  /**
   * Disconnect from SSE stream
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.client.close();
      this.connected = false;
      console.log(`[SSE] Disconnected from "${this.config.name}"`);
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get serverName(): string {
    return this.config.name;
  }
}
