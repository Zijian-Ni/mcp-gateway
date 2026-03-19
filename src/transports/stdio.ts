/**
 * stdio transport adapter for spawning MCP servers as child processes
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { UpstreamServerConfig, ToolInfo } from '../types.js';

export class StdioTransportAdapter {
  private client: Client;
  private transport: StdioClientTransport | null = null;
  private config: UpstreamServerConfig;
  private connected = false;

  constructor(config: UpstreamServerConfig) {
    if (!config.command) {
      throw new Error(`stdio transport requires "command" for server "${config.name}"`);
    }

    this.config = config;
    this.client = new Client(
      { name: 'mcp-gateway', version: '0.1.0' },
      { capabilities: {} }
    );
  }

  /**
   * Spawn the process and establish MCP connection
   */
  async connect(): Promise<void> {
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...(this.config.env ?? {}),
    };

    this.transport = new StdioClientTransport({
      command: this.config.command!,
      args: this.config.args ?? [],
      env,
    });

    await this.client.connect(this.transport);
    this.connected = true;
    console.log(`[stdio] Connected to "${this.config.name}" via ${this.config.command}`);
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
   * Disconnect and kill the child process
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.client.close();
      this.connected = false;
      console.log(`[stdio] Disconnected from "${this.config.name}"`);
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get serverName(): string {
    return this.config.name;
  }
}
