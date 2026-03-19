/**
 * LRU response cache for identical tool call requests
 */

import type { CacheConfig, CacheEntry } from './types.js';

export class Cache {
  private store: Map<string, CacheEntry>;
  private config: CacheConfig;
  private accessOrder: string[];

  constructor(config: CacheConfig) {
    this.config = config;
    this.store = new Map();
    this.accessOrder = [];
  }

  /**
   * Generate a cache key for a tool call
   */
  static buildKey(toolName: string, params: unknown): string {
    return `${toolName}:${JSON.stringify(params)}`;
  }

  /**
   * Get a cached result, returns undefined if not found or expired
   */
  get(key: string): unknown {
    if (!this.config.enabled) return undefined;

    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.removeFromOrder(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.removeFromOrder(key);
    this.accessOrder.push(key);

    return entry.result;
  }

  /**
   * Set a cache entry
   */
  set(key: string, result: unknown): void {
    if (!this.config.enabled) return;

    // Evict LRU if at capacity
    while (this.store.size >= this.config.maxSize) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.store.delete(oldest);
      } else {
        break;
      }
    }

    this.store.set(key, {
      result,
      expiresAt: Date.now() + this.config.ttlSeconds * 1000,
    });

    this.removeFromOrder(key);
    this.accessOrder.push(key);
  }

  /**
   * Invalidate a specific cache entry
   */
  invalidate(key: string): void {
    this.store.delete(key);
    this.removeFromOrder(key);
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.store.clear();
    this.accessOrder = [];
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; maxSize: number; enabled: boolean } {
    return {
      size: this.store.size,
      maxSize: this.config.maxSize,
      enabled: this.config.enabled,
    };
  }

  /**
   * Purge all expired entries
   */
  purgeExpired(): number {
    const now = Date.now();
    let purged = 0;

    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        this.removeFromOrder(key);
        purged++;
      }
    }

    return purged;
  }

  private removeFromOrder(key: string): void {
    const idx = this.accessOrder.indexOf(key);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
    }
  }
}
