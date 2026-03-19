import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Cache } from '../cache.js';

describe('Cache', () => {
  let cache: Cache;

  beforeEach(() => {
    cache = new Cache({ enabled: true, maxSize: 3, ttlSeconds: 60 });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves a value', () => {
    cache.set('key1', { data: 'value1' });
    expect(cache.get('key1')).toEqual({ data: 'value1' });
  });

  it('returns undefined for missing key', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('expires entries after TTL', () => {
    cache.set('key1', 'value');
    expect(cache.get('key1')).toBe('value');

    vi.advanceTimersByTime(61000); // 61 seconds
    expect(cache.get('key1')).toBeUndefined();
  });

  it('evicts LRU when at capacity', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    // Access key1 to make it recently used
    cache.get('key1');

    // Adding key4 should evict key2 (LRU)
    cache.set('key4', 'value4');

    expect(cache.get('key1')).toBe('value1');
    expect(cache.get('key2')).toBeUndefined(); // evicted
    expect(cache.get('key3')).toBe('value3');
    expect(cache.get('key4')).toBe('value4');
  });

  it('invalidates a specific key', () => {
    cache.set('key1', 'value1');
    cache.invalidate('key1');
    expect(cache.get('key1')).toBeUndefined();
  });

  it('clears all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBeUndefined();
    expect(cache.stats().size).toBe(0);
  });

  it('returns stats', () => {
    cache.set('key1', 'value1');
    const stats = cache.stats();
    expect(stats.size).toBe(1);
    expect(stats.maxSize).toBe(3);
    expect(stats.enabled).toBe(true);
  });

  it('builds consistent cache keys', () => {
    const key1 = Cache.buildKey('get_weather', { city: 'London' });
    const key2 = Cache.buildKey('get_weather', { city: 'London' });
    const key3 = Cache.buildKey('get_weather', { city: 'Paris' });
    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
  });

  it('purges expired entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');

    vi.advanceTimersByTime(61000);

    const purged = cache.purgeExpired();
    expect(purged).toBe(2);
    expect(cache.stats().size).toBe(0);
  });

  it('does nothing when disabled', () => {
    const disabledCache = new Cache({ enabled: false, maxSize: 100, ttlSeconds: 60 });
    disabledCache.set('key1', 'value1');
    expect(disabledCache.get('key1')).toBeUndefined();
  });
});
