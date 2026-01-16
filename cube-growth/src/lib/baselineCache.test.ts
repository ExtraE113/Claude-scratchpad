/**
 * Unit tests for baseline cache functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getBaselineCache,
  getBaselineScore,
  isBaselineCacheReady,
  isBaselineFetching,
  clearBaselineCache,
  preloadBaselineCache,
} from './baselineCache';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('baselineCache', () => {
  beforeEach(() => {
    clearBaselineCache();
    mockFetch.mockReset();
  });

  afterEach(() => {
    clearBaselineCache();
  });

  describe('getBaselineCache', () => {
    it('fetches baseline from EDHREC API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            inRecs: [
              { name: 'Sol Ring', score: 100 },
              { name: 'Arcane Signet', score: 90 },
            ],
            more: false,
          }),
      });

      const cache = await getBaselineCache();

      expect(cache.get('Sol Ring')).toBe(100);
      expect(cache.get('Arcane Signet')).toBe(90);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('sends correct request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            inRecs: [],
            more: false,
          }),
      });

      await getBaselineCache();

      expect(mockFetch).toHaveBeenCalledWith('/api/edhrec/recs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cards: [],
          commanders: ['Kenrith, the Returned King'],
          name: '',
          options: {
            excludeLands: false,
            offset: 0,
          },
        }),
      });
    });

    it('fetches multiple pages when more is true', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              inRecs: [{ name: 'Sol Ring', score: 100 }],
              more: true,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              inRecs: [{ name: 'Arcane Signet', score: 90 }],
              more: true,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              inRecs: [{ name: 'Command Tower', score: 80 }],
              more: false,
            }),
        });

      const cache = await getBaselineCache();

      expect(cache.size).toBe(3);
      expect(cache.get('Sol Ring')).toBe(100);
      expect(cache.get('Arcane Signet')).toBe(90);
      expect(cache.get('Command Tower')).toBe(80);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('uses correct offset for pagination', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              inRecs: [],
              more: true,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              inRecs: [],
              more: false,
            }),
        });

      await getBaselineCache();

      // First call should have offset 0
      const firstCall = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(firstCall.options.offset).toBe(0);

      // Second call should have offset 100
      const secondCall = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(secondCall.options.offset).toBe(100);
    });

    it('returns cached data on subsequent calls', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            inRecs: [{ name: 'Sol Ring', score: 100 }],
            more: false,
          }),
      });

      const cache1 = await getBaselineCache();
      const cache2 = await getBaselineCache();

      expect(cache1).toBe(cache2);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('handles fetch errors gracefully by returning empty cache', async () => {
      // Suppress console.warn for this test
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Should return empty cache, not throw
      const cache = await getBaselineCache();
      expect(cache.size).toBe(0);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('handles non-ok response gracefully by returning empty cache', async () => {
      // Suppress console.warn for this test
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      // Should return empty cache, not throw
      const cache = await getBaselineCache();
      expect(cache.size).toBe(0);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('stops at MAX_PAGES (10)', async () => {
      // Mock 10 pages with more=true, then fail on the 11th (should never be called)
      for (let i = 0; i < 10; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              inRecs: [{ name: `Card ${i}`, score: 100 - i }],
              more: true,
            }),
        });
      }

      const cache = await getBaselineCache();

      expect(mockFetch).toHaveBeenCalledTimes(10);
      expect(cache.size).toBe(10);
    });

    it('keeps highest score for duplicate cards', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              inRecs: [{ name: 'Sol Ring', score: 100 }],
              more: true,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              inRecs: [{ name: 'Sol Ring', score: 50 }],
              more: false,
            }),
        });

      const cache = await getBaselineCache();

      expect(cache.get('Sol Ring')).toBe(100);
    });

    it('continues fetching after page error', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              inRecs: [{ name: 'Sol Ring', score: 100 }],
              more: true,
            }),
        })
        .mockRejectedValueOnce(new Error('Network error'));

      // Should still return with what was fetched
      const cache = await getBaselineCache();

      expect(cache.size).toBe(1);
      expect(cache.get('Sol Ring')).toBe(100);
    });
  });

  describe('getBaselineScore', () => {
    it('returns score for known card', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            inRecs: [{ name: 'Sol Ring', score: 100 }],
            more: false,
          }),
      });

      const score = await getBaselineScore('Sol Ring');
      expect(score).toBe(100);
    });

    it('returns 0 for unknown card', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            inRecs: [{ name: 'Sol Ring', score: 100 }],
            more: false,
          }),
      });

      const score = await getBaselineScore('Unknown Card');
      expect(score).toBe(0);
    });
  });

  describe('isBaselineCacheReady', () => {
    it('returns false initially', () => {
      expect(isBaselineCacheReady()).toBe(false);
    });

    it('returns true after cache is loaded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            inRecs: [],
            more: false,
          }),
      });

      await getBaselineCache();
      expect(isBaselineCacheReady()).toBe(true);
    });
  });

  describe('isBaselineFetching', () => {
    it('returns false initially', () => {
      expect(isBaselineFetching()).toBe(false);
    });

    it('returns true while fetching', async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockReturnValueOnce(pendingPromise);

      // Start the fetch but don't await
      const fetchPromise = getBaselineCache();

      // Should be fetching now
      expect(isBaselineFetching()).toBe(true);

      // Resolve the fetch
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ inRecs: [], more: false }),
      });

      await fetchPromise;
      expect(isBaselineFetching()).toBe(false);
    });
  });

  describe('clearBaselineCache', () => {
    it('clears the cached data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            inRecs: [{ name: 'Sol Ring', score: 100 }],
            more: false,
          }),
      });

      await getBaselineCache();
      expect(isBaselineCacheReady()).toBe(true);

      clearBaselineCache();
      expect(isBaselineCacheReady()).toBe(false);

      // Should fetch again after clearing
      await getBaselineCache();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('preloadBaselineCache', () => {
    it('starts fetching in background', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            inRecs: [],
            more: false,
          }),
      });

      preloadBaselineCache();

      // Should have started fetching
      expect(isBaselineFetching()).toBe(true);
    });

    it('does not start new fetch if already fetching', () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockReturnValueOnce(pendingPromise);

      preloadBaselineCache();
      preloadBaselineCache();

      expect(mockFetch).toHaveBeenCalledOnce();

      // Cleanup
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ inRecs: [], more: false }),
      });
    });

    it('does not start new fetch if cache already exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            inRecs: [],
            more: false,
          }),
      });

      await getBaselineCache();
      preloadBaselineCache();

      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  describe('concurrent access', () => {
    it('returns same promise for concurrent calls', async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockReturnValueOnce(pendingPromise);

      // Start two concurrent fetches
      const promise1 = getBaselineCache();
      const promise2 = getBaselineCache();

      // Resolve the fetch
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ inRecs: [], more: false }),
      });

      const [cache1, cache2] = await Promise.all([promise1, promise2]);

      expect(cache1).toBe(cache2);
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });
});
