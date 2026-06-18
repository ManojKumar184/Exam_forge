/**
 * Size-limited LRU-like Map cache.
 * Automatically evicts oldest entries when maxSize is exceeded.
 * Used by export generators to prevent unbounded memory growth.
 */
export function createBoundedCache(maxSize = 500) {
  const map = new Map();
  return {
    has(key) { return map.has(key); },
    get(key) { return map.get(key); },
    set(key, value) {
      if (map.size >= maxSize) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
      map.set(key, value);
    },
    delete(key) { map.delete(key); },
    clear() { map.clear(); },
    get size() { return map.size; },
  };
}
