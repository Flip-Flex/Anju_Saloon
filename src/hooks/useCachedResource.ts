import { useState, useEffect, useCallback, useRef } from 'react';

interface CacheOptions<T> {
    ttl?: number; // Time to live in milliseconds (default 5 minutes)
    initialData?: T;
    skip?: boolean; // If true, finding/fetching is skipped
}

interface CachedResource<T> {
    data: T | null;
    loading: boolean;
    isSyncing: boolean;
    error: any;
    refresh: () => Promise<void>;
    mutate: (newData: T) => void;
}

// Global cache in memory to avoid parsing JSON repeatedly during same session if needed,
// but for "Instant-First" persistence, we rely primarily on localStorage.
// We can use a memory cache map to speed up component re-mounts in same session.
const memoryCache = new Map<string, { data: any; timestamp: number }>();

export const useCachedResource = <T>(
    key: string,
    fetcher: () => Promise<{ data: T } | T>, // Support axios response or direct data
    options: CacheOptions<T> = {}
): CachedResource<T> => {
    const { ttl = 5 * 60 * 1000, skip = false } = options;
    const CACHE_KEY_PREFIX = 'ANJU_SALOON_CACHE_V1_';
    const fullKey = `${CACHE_KEY_PREFIX}${key}`;

    // State
    const [data, setData] = useState<T | null>(options.initialData || null);
    const [loading, setLoading] = useState(true); // Initial load (reading cache)
    const [isSyncing, setIsSyncing] = useState(false); // Background fetch
    const [error, setError] = useState<any>(null);

    // Use ref to track if component is mounted to prevent state updates after unmount
    const isMounted = useRef(true);

    // Helper to safely get data from response
    const extractData = (res: any): T => {
        if (res && typeof res === 'object' && 'data' in res) {
            return res.data;
        }
        return res;
    };

    const loadFromCache = useCallback(() => {
        if (skip) return false;

        // 1. Try Memory Cache first (fastest)
        if (memoryCache.has(fullKey)) {
            const cached = memoryCache.get(fullKey);
            if (cached) {
                setData(cached.data);
                return true; // Cache hit
            }
        }

        // 2. Try Local Storage
        try {
            const stored = localStorage.getItem(fullKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                // We render it even if expired (stale-while-revalidate), 
                // effectively ignoring TTL for *display* purposes, but logic below triggers fetch.
                setData(parsed.data);
                // Hydrate memory cache
                memoryCache.set(fullKey, { data: parsed.data, timestamp: parsed.timestamp });
                return true; // Cache hit
            }
        } catch (e) {
            console.warn(`Failed to parse cache for ${key}`, e);
        }
        return false; // Cache miss
    }, [fullKey, skip, key]);

    const fetchData = useCallback(async () => {
        if (skip) return;

        setIsSyncing(true);
        // We only set loading=true if we have NO data to show.
        const hasData = memoryCache.has(fullKey);
        if (!hasData) {
            setLoading(true);
        }

        try {
            const response = await fetcher();
            const newData = extractData(response);

            if (isMounted.current) {
                console.log(`[useCachedResource] Fetched ${key}:`, Array.isArray(newData) ? `${newData.length} items` : newData);
            }

            // Save to caches (Always update cache, even if component unmounted)
            const timestamp = Date.now();
            const cachePayload = { data: newData, timestamp };

            memoryCache.set(fullKey, cachePayload);
            try {
                localStorage.setItem(fullKey, JSON.stringify(cachePayload));
                if (Array.isArray(newData) && newData.length === 0) {
                    // console.log(`[useCachedResource] Cleared/Updated local storage for ${key} (Empty Array)`);
                }
            } catch (e) {
                console.error("Cache set failed (quota?)", e);
            }

            if (isMounted.current) {
                // Only update if data actually changed (deep comparison is expensive, strict ref check or JSON stringify for simple objects is okay)
                // For simplicity/perf, we just set it. React handles strict equality checks.
                setData(newData);
                setError(null);
            }
        } catch (err) {
            if (isMounted.current) {
                console.error(`Fetch failed for ${key}`, err);
                setError(err);
                // If we have no data, this is a hard error. If we have cache, it's a soft error (toast?)
            }
        } finally {
            if (isMounted.current) {
                setLoading(false);
                setIsSyncing(false);
            }
        }
    }, [fetcher, fullKey, skip, key]);

    // Initial Sync Logic
    useEffect(() => {
        isMounted.current = true;

        if (!skip) {
            const hasCache = loadFromCache();
            // If we have cache, we are not 'loading' visually
            if (hasCache) setLoading(false);

            // Decide if we need to fetch
            // Instant-First: Always fetch to simplify sync? 
            // Or check TTL? User req: "Render immediate... Fire API in parallel" -> ALWAYS FETCH
            fetchData();
        } else {
            setLoading(false);
        }

        return () => {
            isMounted.current = false;
        };
    }, [fullKey, skip]); // Dependencies: key change -> reload. fetcher stability is caller responsibility.

    // Manual refresh
    const refresh = useCallback(async () => {
        await fetchData();
    }, [fetchData]);

    // Manual mutation (for optimistic updates)
    const mutate = useCallback((newData: T) => {
        if (isMounted.current) {
            setData(newData);
        }
        const timestamp = Date.now();
        const cachePayload = { data: newData, timestamp };
        memoryCache.set(fullKey, cachePayload);
        try {
            localStorage.setItem(fullKey, JSON.stringify(cachePayload));
        } catch (e) {
            console.error("Cache set failed (quota?)", e);
        }
    }, [fullKey]);

    return { data, loading, isSyncing, error, refresh, mutate };
};
