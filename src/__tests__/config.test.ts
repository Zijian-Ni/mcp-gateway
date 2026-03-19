import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig, validateConfig } from '../config.js';

const validConfig = `
gateway:
  port: 3000
  host: "127.0.0.1"
  requireAuth: true

servers:
  - name: test-server
    transport: stdio
    command: node
    args: [server.js]

apiKeys:
  - key: "test-key-12345678"
    name: "test-user"

rateLimit:
  tokensPerMinute: 60
  burstSize: 10

cache:
  enabled: true
  maxSize: 100
  ttlSeconds: 300

logging:
  dbPath: "./test.db"
  maxParamLength: 500
`;

describe('Config', () => {
  const tmpDir = os.tmpdir();

  afterEach(() => {
    // Cleanup any test db files
    const dbFile = path.join(process.cwd(), 'test.db');
    if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  });

  it('loads a valid config', () => {
    const configPath = path.join(tmpDir, 'test-config.yaml');
    fs.writeFileSync(configPath, validConfig);

    const config = loadConfig(configPath);
    expect(config.gateway.port).toBe(3000);
    expect(config.servers).toHaveLength(1);
    expect(config.servers[0].name).toBe('test-server');
    expect(config.servers[0].transport).toBe('stdio');

    fs.unlinkSync(configPath);
  });

  it('throws for non-existent config file', () => {
    expect(() => loadConfig('/nonexistent/config.yaml')).toThrow('Config file not found');
  });

  it('throws for invalid YAML', () => {
    const configPath = path.join(tmpDir, 'bad-config.yaml');
    fs.writeFileSync(configPath, 'not: valid: yaml: [unclosed');
    expect(() => loadConfig(configPath)).toThrow();
    fs.unlinkSync(configPath);
  });

  it('resolves environment variables', () => {
    process.env['TEST_API_KEY'] = 'my-secret-key-99';
    const configWithEnv = validConfig.replace('test-key-12345678', '${TEST_API_KEY}');
    const configPath = path.join(tmpDir, 'env-config.yaml');
    fs.writeFileSync(configPath, configWithEnv);

    const config = loadConfig(configPath);
    expect(config.apiKeys[0].key).toBe('my-secret-key-99');

    fs.unlinkSync(configPath);
    delete process.env['TEST_API_KEY'];
  });

  it('resolves env vars with defaults', () => {
    delete process.env['MISSING_VAR'];
    const configWithDefault = validConfig.replace('3000', '${MISSING_VAR:-4000}');
    const configPath = path.join(tmpDir, 'default-config.yaml');
    fs.writeFileSync(configPath, configWithDefault);

    const config = loadConfig(configPath);
    expect(config.gateway.port).toBe(4000);

    fs.unlinkSync(configPath);
  });

  it('validates config returns true for valid config', () => {
    const configPath = path.join(tmpDir, 'valid-config.yaml');
    fs.writeFileSync(configPath, validConfig);

    const { valid, errors } = validateConfig(configPath);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);

    fs.unlinkSync(configPath);
  });

  it('validates config returns false for invalid config', () => {
    const configPath = path.join(tmpDir, 'invalid-config.yaml');
    fs.writeFileSync(configPath, 'servers: []'); // No servers
    const { valid, errors } = validateConfig(configPath);
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
    fs.unlinkSync(configPath);
  });

  it('requires url for SSE transport', () => {
    const invalidConfig = validConfig.replace('transport: stdio\n    command: node', 'transport: sse');
    const configPath = path.join(tmpDir, 'sse-config.yaml');
    fs.writeFileSync(configPath, invalidConfig);

    const { valid } = validateConfig(configPath);
    expect(valid).toBe(false);

    fs.unlinkSync(configPath);
  });
});
