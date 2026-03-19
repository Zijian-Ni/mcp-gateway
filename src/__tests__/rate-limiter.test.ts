import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RateLimiter } from '../rate-limiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ tokensPerMinute: 60, burstSize: 5 });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests within burst limit', () => {
    expect(limiter.consume('user1')).toBe(true);
    expect(limiter.consume('user1')).toBe(true);
    expect(limiter.consume('user1')).toBe(true);
    expect(limiter.consume('user1')).toBe(true);
    expect(limiter.consume('user1')).toBe(true);
  });

  it('blocks requests when burst is exhausted', () => {
    for (let i = 0; i < 5; i++) limiter.consume('user1');
    expect(limiter.consume('user1')).toBe(false);
  });

  it('refills tokens over time', () => {
    // Exhaust all tokens
    for (let i = 0; i < 5; i++) limiter.consume('user1');
    expect(limiter.consume('user1')).toBe(false);

    // Advance 1 second = 1 token refilled (60/minute = 1/second)
    vi.advanceTimersByTime(1000);
    expect(limiter.consume('user1')).toBe(true);
  });

  it('respects per-key overrides', () => {
    limiter.setOverride('vip', 600); // 10 tokens/second
    limiter.consume('vip'); // Consume one

    // With normal rate this would be slow, but VIP refills faster
    vi.advanceTimersByTime(100); // 100ms = ~1 token at 600/min
    expect(limiter.remaining('vip')).toBeGreaterThan(4);
  });

  it('tracks remaining tokens', () => {
    expect(limiter.remaining('user2')).toBe(5); // Full bucket
    limiter.consume('user2');
    limiter.consume('user2');
    expect(limiter.remaining('user2')).toBeLessThan(4);
  });

  it('resets a bucket', () => {
    for (let i = 0; i < 5; i++) limiter.consume('user3');
    expect(limiter.consume('user3')).toBe(false);

    limiter.reset('user3');
    expect(limiter.consume('user3')).toBe(true);
  });

  it('tracks separate buckets per key', () => {
    for (let i = 0; i < 5; i++) limiter.consume('user1');
    // user2 should have its own full bucket
    expect(limiter.consume('user2')).toBe(true);
    expect(limiter.consume('user2')).toBe(true);
  });

  it('prunes old buckets', () => {
    limiter.consume('old-user');
    // Advance time beyond prune threshold
    vi.advanceTimersByTime(400000); // 6+ minutes
    limiter.prune(300000); // Prune entries older than 5 minutes
    // After prune, old-user should start fresh
    expect(limiter.remaining('old-user')).toBe(5);
  });
});
