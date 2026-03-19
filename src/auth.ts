/**
 * API key authentication middleware
 */

import type { ApiKeyConfig } from './types.js';

export class AuthManager {
  private keyMap: Map<string, ApiKeyConfig>;
  private requireAuth: boolean;

  constructor(apiKeys: ApiKeyConfig[], requireAuth: boolean) {
    this.keyMap = new Map();
    this.requireAuth = requireAuth;

    for (const keyConfig of apiKeys) {
      this.keyMap.set(keyConfig.key, keyConfig);
    }
  }

  /**
   * Validate an API key from a request header value
   * Returns the key config if valid, null if invalid/missing
   */
  validateKey(apiKey: string | undefined): ApiKeyConfig | null {
    if (!this.requireAuth) {
      // Return a default permissive config when auth is disabled
      return {
        key: '__no_auth__',
        name: 'anonymous',
        allowedTools: [],
        allowedServers: [],
      };
    }

    if (!apiKey) return null;

    // Support "Bearer <key>" format
    const key = apiKey.startsWith('Bearer ') ? apiKey.slice(7) : apiKey;
    return this.keyMap.get(key) ?? null;
  }

  /**
   * Check if a key is allowed to call a specific tool on a specific server
   */
  isAllowed(keyConfig: ApiKeyConfig, toolName: string, serverName: string): boolean {
    // Check tool allowlist (empty = all allowed)
    if (keyConfig.allowedTools && keyConfig.allowedTools.length > 0) {
      if (!keyConfig.allowedTools.includes(toolName)) {
        return false;
      }
    }

    // Check server allowlist (empty = all allowed)
    if (keyConfig.allowedServers && keyConfig.allowedServers.length > 0) {
      if (!keyConfig.allowedServers.includes(serverName)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get the rate limit override for a key (tokens per minute)
   */
  getRateLimit(keyConfig: ApiKeyConfig): number | undefined {
    return keyConfig.rateLimit;
  }

  /**
   * List all registered keys (without exposing actual key values)
   */
  listKeys(): { name: string; allowedTools: string[]; allowedServers: string[] }[] {
    return Array.from(this.keyMap.values()).map((k) => ({
      name: k.name,
      allowedTools: k.allowedTools ?? [],
      allowedServers: k.allowedServers ?? [],
    }));
  }
}
