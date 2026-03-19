# mcp-gateway

> A lightweight, production-ready **MCP (Model Context Protocol) Gateway** — unified routing, authentication, logging, and rate limiting for multiple MCP servers.

[![CI](https://github.com/Zijian-Ni/mcp-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/Zijian-Ni/mcp-gateway/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/%40niclaw%2Fmcp-gateway.svg)](https://badge.fury.io/js/%40niclaw%2Fmcp-gateway)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          LLM Agents / Clients                       │
│               (Claude, GPT-4, local agents, scripts)                │
└───────────────┬─────────────────────────────────────────────────────┘
                │  HTTP (POST /call, GET /tools)
                │  Authorization: Bearer <api-key>
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          mcp-gateway                                │
│                                                                     │
│  ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │   Auth   │  │Rate Limiter│  │  Cache   │  │     Logger       │  │
│  │ (API key)│  │(token bucket│  │  (LRU)  │  │   (SQLite)       │  │
│  └──────────┘  └────────────┘  └──────────┘  └──────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                          Router                              │   │
│  │           tool_name  →  upstream_server                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────┬───────────────────┬───────────────────┬──────────────────────┘
       │ stdio             │ SSE               │ HTTP
       ▼                   ▼                   ▼
┌────────────┐    ┌────────────────┐    ┌────────────────┐
│MCP Server A│    │  MCP Server B  │    │  MCP Server C  │
│(filesystem)│    │ (github tools) │    │ (remote tools) │
│  [local]   │    │   [local/net]  │    │    [cloud]     │
└────────────┘    └────────────────┘    └────────────────┘
```

---

## Features

- 🔀 **Unified Routing** — Aggregate tools from multiple MCP servers behind a single endpoint. Tool discovery is automatic on startup.
- 🔑 **API Key Auth** — Per-key allowlists for tools and servers. `Bearer` token and `X-API-Key` header support.
- ⚡ **Rate Limiting** — Token bucket algorithm, configurable per API key, with burst support.
- 💾 **Response Cache** — LRU cache with TTL for identical requests. Dramatically reduces upstream load.
- 📊 **SQLite Logging** — Every tool call logged with timing, success/failure, truncated params & results.
- 🔌 **Multi-Transport** — Connect upstream servers via `stdio` (local process), `SSE`, or streamable `HTTP`.
- 🔧 **YAML Config** — Friendly YAML configuration with `${ENV_VAR:-default}` environment variable resolution.
- 🖥️ **CLI** — `mcpx start`, `mcpx list-tools`, `mcpx logs`, `mcpx config validate`.

---

## Quick Start

### Install

```bash
# Global install for CLI use
npm install -g @niclaw/mcp-gateway

# Or as a project dependency
npm install @niclaw/mcp-gateway
```

### Configure

```bash
cp config.example.yaml config.yaml
# Edit config.yaml with your upstream MCP servers and API keys
```

### Run

```bash
# Start the gateway
mcpx start --config ./config.yaml

# List discovered tools
mcpx list-tools

# View logs
mcpx logs --tail 50

# Validate config
mcpx config validate
```

---

## Configuration Reference

All configuration is in `config.yaml` (YAML). See `config.example.yaml` for a full annotated example.

### `gateway`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | number | `3000` | HTTP port to listen on |
| `host` | string | `127.0.0.1` | Bind host |
| `requireAuth` | boolean | `true` | Require API key from clients |

### `servers[]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Unique server identifier |
| `transport` | `stdio` \| `sse` \| `http` | ✅ | Connection transport |
| `command` | string | stdio only | Command to execute |
| `args` | string[] | No | Arguments for command |
| `env` | object | No | Extra environment variables |
| `url` | string | sse/http only | Server URL |
| `timeout` | number | `30000` | Tool call timeout (ms) |

### `apiKeys[]`

| Field | Type | Description |
|-------|------|-------------|
| `key` | string | The API key value (min 8 chars) |
| `name` | string | Human-readable label |
| `allowedTools` | string[] | Permitted tool names (empty = all) |
| `allowedServers` | string[] | Permitted server names (empty = all) |
| `rateLimit` | number | Tokens/minute override |

### `rateLimit`

| Field | Default | Description |
|-------|---------|-------------|
| `tokensPerMinute` | `60` | Refill rate |
| `burstSize` | `10` | Max burst capacity |

### `cache`

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Enable/disable caching |
| `maxSize` | `1000` | Max number of cached entries |
| `ttlSeconds` | `300` | Seconds before cache entries expire |

### `logging`

| Field | Default | Description |
|-------|---------|-------------|
| `dbPath` | `./mcp-gateway.db` | SQLite database path |
| `maxParamLength` | `500` | Truncate logged params beyond this length |

### Environment Variable Substitution

In config values, use `${VAR}` or `${VAR:-default}`:

```yaml
apiKeys:
  - key: "${GATEWAY_API_KEY}"       # Required env var
    name: "${KEY_NAME:-my-agent}"   # With default fallback
```

---

## CLI Reference

### `mcpx start`

Start the gateway server.

```
mcpx start [options]

Options:
  -c, --config <path>   Path to config file (default: ./config.yaml)
  -h, --help            Display help
```

### `mcpx list-tools`

Discover and list all tools from configured upstream servers.

```
mcpx list-tools [options]

Options:
  -c, --config <path>   Path to config file (default: ./config.yaml)
  --json                Output as JSON
```

### `mcpx logs`

View request logs from the SQLite database.

```
mcpx logs [options]

Options:
  -c, --config <path>   Path to config file (default: ./config.yaml)
  -n, --tail <number>   Show last N entries (default: 20)
  --tool <name>         Filter by tool name
  --server <name>       Filter by server name
  --json                Output as JSON
```

### `mcpx config validate`

Validate your config file without starting the gateway.

```
mcpx config validate [options]

Options:
  -c, --config <path>   Path to config file (default: ./config.yaml)
```

---

## HTTP API

Once the gateway is running, it exposes a simple HTTP API.

### `GET /health`

Health check.

```json
{ "status": "ok", "uptime": 12345 }
```

### `GET /tools`

List all available tools.

**Headers:** `Authorization: Bearer <api-key>`

```json
{
  "tools": [
    {
      "name": "read_file",
      "description": "Read a file from the filesystem",
      "inputSchema": { "type": "object", "properties": { "path": { "type": "string" } } },
      "serverName": "filesystem"
    }
  ]
}
```

### `POST /call`

Invoke a tool.

**Headers:** `Authorization: Bearer <api-key>`, `Content-Type: application/json`

**Request:**
```json
{
  "tool": "read_file",
  "params": { "path": "/home/user/notes.txt" }
}
```

**Response:**
```json
{
  "result": { "content": [{ "type": "text", "text": "Hello world" }] },
  "durationMs": 45,
  "cached": false
}
```

### `GET /stats`

Gateway statistics.

```json
{
  "uptime": 86400000,
  "totalRequests": 1234,
  "successfulRequests": 1200,
  "failedRequests": 34,
  "servers": [
    { "name": "filesystem", "connected": true, "toolCount": 5 }
  ]
}
```

---

## Programmatic Usage

```typescript
import { Gateway } from '@niclaw/mcp-gateway';
import { loadConfig } from '@niclaw/mcp-gateway/config';

const config = loadConfig('./config.yaml');
const gateway = new Gateway(config);

await gateway.start();

// List all tools
const tools = gateway.listTools();
console.log(tools);

// Call a tool directly (bypasses HTTP layer)
const result = await gateway.callTool('read_file', { path: '/etc/hosts' }, {
  apiKey: 'your-api-key',
});

// Get stats
const stats = gateway.getStats();

// Graceful shutdown
await gateway.stop();
```

---

## Roadmap

- [ ] **WebSocket transport** — bidirectional streaming support
- [ ] **Tool namespacing** — `server.toolname` prefix to avoid collisions
- [ ] **Health monitoring** — auto-reconnect on upstream server failure
- [ ] **Admin UI** — web dashboard for logs, stats, and config management
- [ ] **OpenAPI/Swagger** — auto-generate docs from tool schemas
- [ ] **gRPC transport** — high-performance binary protocol support
- [ ] **Metrics export** — Prometheus/OpenTelemetry integration
- [ ] **Clustering** — multi-instance support with shared Redis cache
- [ ] **Plugin system** — custom middleware hooks

---

## Development

```bash
git clone https://github.com/Zijian-Ni/mcp-gateway.git
cd mcp-gateway
npm install
npm run build
npm test
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm test` | Run tests with Vitest |
| `npm run test:coverage` | Run tests with coverage |
| `npm run lint` | Lint with ESLint |
| `npm run typecheck` | Type-check without emitting |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

See [SECURITY.md](SECURITY.md) for our responsible disclosure policy.

## Code of Conduct

This project follows the [Contributor Covenant v2.1](CODE_OF_CONDUCT.md).

---

## Author

**Zijian Ni** — [@Zijian-Ni](https://github.com/Zijian-Ni)

## License

MIT © 2026 Zijian Ni — see [LICENSE](LICENSE) for details.
