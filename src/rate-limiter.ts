/**
 * Token bucket rate limiter (per API key)
 */

import type { RateLimitConfig, TokenBucket } from './types.js';

export class RateLimiter {
  private buckets: Map<string, TokenBucket>;
  private config: RateLimitConfig;
  private overrides: Map<string, number>; // key → custom tokensPerMinute

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.buckets = new Map();
    this.overrides = new Map();
  }

  /**
   * Set a per-key rate limit override (tokens per minute)
   */
  setOverride(key: string, tokensPerMinute: number): void {
    this.overrides.set(key, tokensPerMinute);
  }

  /**
   * Attempt to consume a token for the given key.
   * Returns true if allowed, false if rate limited.
   */
  consume(key: string, tokens = 1): boolean {
    const now = Date.now();
    const tpm = this.overrides.get(key) ?? this.config.tokensPerMinute;
    const refillRate = tpm / 60000; // tokens per millisecond

    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: this.config.burstSize,
        lastRefill: now,
      };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const refilled = elapsed * refillRate;
    bucket.tokens = Math.min(bucket.tokens + refilled, this.config.burstSize);
    bucket.lastRefill = now;

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Get remaining tokens for a key
   */
  remaining(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return this.config.burstSize;

    const now = Date.now();
    const tpm = this.overrides.get(key) ?? this.config.tokensPerMinute;
    const refillRate = tpm / 60000;
    const elapsed = now - bucket.lastRefill;
    const refilled = elapsed * refillRate;
    return Math.min(bucket.tokens + refilled, this.config.burstSize);
  }

  /**
   * Reset the bucket for a key (e.g., after a successful auth)
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Prune old buckets to prevent memory leak (call periodically)
   */
  prune(maxAgeMs = 300000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [key, bucket] of this.buckets) {
      if (bucket.lastRefill < cutoff) {
        this.buckets.delete(key);
      }
    }
  }
}
