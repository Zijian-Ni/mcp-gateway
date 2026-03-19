/**
 * Tool name → upstream server routing table
 */

import type { RouteEntry, ToolInfo } from './types.js';

export class Router {
  private routes: Map<string, RouteEntry>;

  constructor() {
    this.routes = new Map();
  }

  /**
   * Register a tool from an upstream server
   * If a tool with the same name exists from a different server, logs a warning
   */
  register(tool: ToolInfo): void {
    const existing = this.routes.get(tool.name);
    if (existing) {
      console.warn(
        `[Router] Tool "${tool.name}" already registered from server "${existing.serverName}". ` +
          `Overriding with server "${tool.serverName}".`
      );
    }

    this.routes.set(tool.name, {
      toolName: tool.name,
      serverName: tool.serverName,
      tool,
    });
  }

  /**
   * Register multiple tools from a server at once
   */
  registerAll(tools: ToolInfo[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Unregister all tools belonging to a server (e.g., on disconnect)
   */
  unregisterServer(serverName: string): void {
    for (const [name, route] of this.routes) {
      if (route.serverName === serverName) {
        this.routes.delete(name);
      }
    }
  }

  /**
   * Look up which server handles a given tool
   */
  resolve(toolName: string): RouteEntry | null {
    return this.routes.get(toolName) ?? null;
  }

  /**
   * Get all registered tools (for exposing to clients)
   */
  listTools(): ToolInfo[] {
    return Array.from(this.routes.values()).map((r) => r.tool);
  }

  /**
   * Get tools registered to a specific server
   */
  getServerTools(serverName: string): ToolInfo[] {
    return Array.from(this.routes.values())
      .filter((r) => r.serverName === serverName)
      .map((r) => r.tool);
  }

  /**
   * Get routing summary
   */
  summary(): { toolName: string; serverName: string }[] {
    return Array.from(this.routes.values()).map((r) => ({
      toolName: r.toolName,
      serverName: r.serverName,
    }));
  }

  /**
   * Total number of registered tools
   */
  get size(): number {
    return this.routes.size;
  }
}
