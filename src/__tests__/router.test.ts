import { describe, it, expect, beforeEach } from 'vitest';
import { Router } from '../router.js';
import type { ToolInfo } from '../types.js';

describe('Router', () => {
  let router: Router;

  const tool1: ToolInfo = {
    name: 'get_weather',
    description: 'Get current weather',
    inputSchema: { type: 'object', properties: { city: { type: 'string' } } },
    serverName: 'weather-server',
  };

  const tool2: ToolInfo = {
    name: 'search_web',
    description: 'Search the web',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    serverName: 'search-server',
  };

  beforeEach(() => {
    router = new Router();
  });

  it('registers a tool and resolves it', () => {
    router.register(tool1);
    const route = router.resolve('get_weather');
    expect(route).not.toBeNull();
    expect(route?.serverName).toBe('weather-server');
    expect(route?.toolName).toBe('get_weather');
  });

  it('returns null for unknown tool', () => {
    expect(router.resolve('unknown_tool')).toBeNull();
  });

  it('registers multiple tools', () => {
    router.registerAll([tool1, tool2]);
    expect(router.size).toBe(2);
    expect(router.resolve('get_weather')?.serverName).toBe('weather-server');
    expect(router.resolve('search_web')?.serverName).toBe('search-server');
  });

  it('lists all tools', () => {
    router.registerAll([tool1, tool2]);
    const tools = router.listTools();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toContain('get_weather');
    expect(tools.map((t) => t.name)).toContain('search_web');
  });

  it('unregisters tools from a server', () => {
    router.registerAll([tool1, tool2]);
    router.unregisterServer('weather-server');
    expect(router.size).toBe(1);
    expect(router.resolve('get_weather')).toBeNull();
    expect(router.resolve('search_web')).not.toBeNull();
  });

  it('overrides duplicate tool registration', () => {
    router.register(tool1);
    const overrideTool: ToolInfo = { ...tool1, serverName: 'other-server' };
    router.register(overrideTool);
    expect(router.resolve('get_weather')?.serverName).toBe('other-server');
    expect(router.size).toBe(1);
  });

  it('gets server-specific tools', () => {
    router.registerAll([tool1, tool2]);
    const weatherTools = router.getServerTools('weather-server');
    expect(weatherTools).toHaveLength(1);
    expect(weatherTools[0].name).toBe('get_weather');
  });

  it('provides routing summary', () => {
    router.registerAll([tool1, tool2]);
    const summary = router.summary();
    expect(summary).toHaveLength(2);
    expect(summary[0]).toHaveProperty('toolName');
    expect(summary[0]).toHaveProperty('serverName');
  });
});
