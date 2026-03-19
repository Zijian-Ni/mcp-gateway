import { describe, it, expect, beforeEach } from 'vitest';
import { AuthManager } from '../auth.js';
import type { ApiKeyConfig } from '../types.js';

const keys: ApiKeyConfig[] = [
  {
    key: 'test-key-abc123',
    name: 'test-user',
    allowedTools: ['get_weather', 'search_web'],
    allowedServers: ['weather-server'],
  },
  {
    key: 'admin-key-xyz789',
    name: 'admin',
    // No restrictions = all tools allowed
  },
];

describe('AuthManager', () => {
  describe('with auth required', () => {
    let auth: AuthManager;

    beforeEach(() => {
      auth = new AuthManager(keys, true);
    });

    it('validates a correct API key', () => {
      const result = auth.validateKey('test-key-abc123');
      expect(result).not.toBeNull();
      expect(result?.name).toBe('test-user');
    });

    it('validates Bearer token format', () => {
      const result = auth.validateKey('Bearer test-key-abc123');
      expect(result).not.toBeNull();
      expect(result?.name).toBe('test-user');
    });

    it('rejects invalid key', () => {
      expect(auth.validateKey('wrong-key')).toBeNull();
    });

    it('rejects missing key', () => {
      expect(auth.validateKey(undefined)).toBeNull();
    });

    it('allows permitted tool', () => {
      const keyConfig = auth.validateKey('test-key-abc123')!;
      expect(auth.isAllowed(keyConfig, 'get_weather', 'weather-server')).toBe(true);
    });

    it('denies tool not in allowedTools', () => {
      const keyConfig = auth.validateKey('test-key-abc123')!;
      expect(auth.isAllowed(keyConfig, 'delete_file', 'weather-server')).toBe(false);
    });

    it('denies server not in allowedServers', () => {
      const keyConfig = auth.validateKey('test-key-abc123')!;
      expect(auth.isAllowed(keyConfig, 'search_web', 'other-server')).toBe(false);
    });

    it('admin key allows everything', () => {
      const keyConfig = auth.validateKey('admin-key-xyz789')!;
      expect(auth.isAllowed(keyConfig, 'any_tool', 'any-server')).toBe(true);
    });

    it('lists keys without exposing values', () => {
      const list = auth.listKeys();
      expect(list).toHaveLength(2);
      expect(list[0]).toHaveProperty('name');
      expect(list[0]).not.toHaveProperty('key');
    });
  });

  describe('with auth disabled', () => {
    let auth: AuthManager;

    beforeEach(() => {
      auth = new AuthManager([], false);
    });

    it('returns anonymous config when no key provided', () => {
      const result = auth.validateKey(undefined);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('anonymous');
    });

    it('anonymous config allows all tools', () => {
      const keyConfig = auth.validateKey(undefined)!;
      expect(auth.isAllowed(keyConfig, 'any_tool', 'any_server')).toBe(true);
    });
  });
});
