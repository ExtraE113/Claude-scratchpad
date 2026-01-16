/**
 * Unit tests for Card Lift Cache
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCardLiftData,
  hasCardLiftData,
  getCardLiftCacheSize,
  clearCardLiftCache,
  preloadCardLiftData,
} from './cardLiftCache';

// Mock fetch globally
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
  clearCardLiftCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCardLiftCache();
});

// Helper to create mock EDHREC response (matches real nested structure)
function createMockResponse(cards: Array<{ name: string; lift: number; synergy?: number }>) {
  return {
    container: {
      json_dict: {
        cardlists: [
          {
            tag: 'highliftcards',
            header: 'High Lift Cards',
            cardviews: cards.map((c) => ({
              name: c.name,
              sanitized: c.name.toLowerCase().replace(/\s/g, '-'),
              lift: c.lift,
              synergy: c.synergy ?? 0.5,
            })),
          },
        ],
      },
    },
  };
}

describe('cardLiftCache', () => {
  describe('getCardLiftData', () => {
    it('fetches lift data from EDHREC', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createMockResponse([
          { name: 'Magus of the Moon', lift: 100 },
          { name: 'Trinisphere', lift: 50 },
        ]),
      });

      const result = await getCardLiftData('Blood Moon');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Magus of the Moon');
      expect(result[0].lift).toBe(100);
      expect(result[1].name).toBe('Trinisphere');
      expect(result[1].lift).toBe(50);
    });

    it('sanitizes card names to URL slugs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createMockResponse([]),
      });

      await getCardLiftData("Thalia, Guardian of Thraben");

      expect(mockFetch).toHaveBeenCalledWith(
        '/json/edhrec/pages/cards/thalia-guardian-of-thraben.json'
      );
    });

    it('handles apostrophes in card names', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createMockResponse([]),
      });

      await getCardLiftData("Urza's Saga");

      expect(mockFetch).toHaveBeenCalledWith(
        '/json/edhrec/pages/cards/urzas-saga.json'
      );
    });

    it('returns cached data on subsequent calls', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createMockResponse([
          { name: 'Card A', lift: 100 },
        ]),
      });

      const result1 = await getCardLiftData('Blood Moon');
      const result2 = await getCardLiftData('Blood Moon');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result1).toBe(result2);
    });

    it('handles case-insensitive cache keys', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createMockResponse([
          { name: 'Card A', lift: 100 },
        ]),
      });

      await getCardLiftData('Blood Moon');
      const result = await getCardLiftData('BLOOD MOON');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });

    it('deduplicates concurrent fetches', async () => {
      let resolvePromise: (value: Response) => void;
      const fetchPromise = new Promise<Response>((resolve) => {
        resolvePromise = resolve;
      });
      mockFetch.mockReturnValueOnce(fetchPromise);

      // Start two concurrent fetches
      const promise1 = getCardLiftData('Blood Moon');
      const promise2 = getCardLiftData('Blood Moon');

      // Resolve the fetch
      resolvePromise!({
        ok: true,
        json: async () => createMockResponse([{ name: 'Card A', lift: 100 }]),
      } as Response);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result1).toBe(result2);
    });

    it('handles API errors gracefully', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await getCardLiftData('Unknown Card');

      expect(result).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('handles network errors gracefully', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await getCardLiftData('Blood Moon');

      expect(result).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('sorts results by lift descending', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createMockResponse([
          { name: 'Low Lift', lift: 10 },
          { name: 'High Lift', lift: 100 },
          { name: 'Medium Lift', lift: 50 },
        ]),
      });

      const result = await getCardLiftData('Blood Moon');

      expect(result[0].name).toBe('High Lift');
      expect(result[1].name).toBe('Medium Lift');
      expect(result[2].name).toBe('Low Lift');
    });

    it('limits results to 100 entries', async () => {
      const manyCards = Array.from({ length: 150 }, (_, i) => ({
        name: `Card ${i}`,
        lift: 150 - i,
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createMockResponse(manyCards),
      });

      const result = await getCardLiftData('Blood Moon');

      expect(result).toHaveLength(100);
      expect(result[0].name).toBe('Card 0');
      expect(result[99].name).toBe('Card 99');
    });

    it('deduplicates cards across cardlists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          container: {
            json_dict: {
              cardlists: [
                {
                  tag: 'creatures',
                  cardviews: [{ name: 'Card A', lift: 100, synergy: 0.5 }],
                },
                {
                  tag: 'artifacts',
                  cardviews: [{ name: 'Card A', lift: 80, synergy: 0.4 }],
                },
              ],
            },
          },
        }),
      });

      const result = await getCardLiftData('Blood Moon');

      // Should only have one entry for Card A (first one seen)
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Card A');
      expect(result[0].lift).toBe(100);
    });

    it('handles empty cardlists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ container: { json_dict: { cardlists: [] } } }),
      });

      const result = await getCardLiftData('Blood Moon');

      expect(result).toHaveLength(0);
    });

    it('handles missing cardlists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await getCardLiftData('Blood Moon');

      expect(result).toHaveLength(0);
    });
  });

  describe('hasCardLiftData', () => {
    it('returns false for uncached cards', () => {
      expect(hasCardLiftData('Blood Moon')).toBe(false);
    });

    it('returns true for cached cards', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createMockResponse([]),
      });

      await getCardLiftData('Blood Moon');

      expect(hasCardLiftData('Blood Moon')).toBe(true);
    });
  });

  describe('getCardLiftCacheSize', () => {
    it('returns 0 for empty cache', () => {
      expect(getCardLiftCacheSize()).toBe(0);
    });

    it('returns correct count after caching', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createMockResponse([]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createMockResponse([]),
        });

      await getCardLiftData('Card 1');
      await getCardLiftData('Card 2');

      expect(getCardLiftCacheSize()).toBe(2);
    });
  });

  describe('preloadCardLiftData', () => {
    it('preloads multiple cards in parallel', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createMockResponse([]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createMockResponse([]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createMockResponse([]),
        });

      await preloadCardLiftData(['Card 1', 'Card 2', 'Card 3']);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(getCardLiftCacheSize()).toBe(3);
    });
  });

  describe('clearCardLiftCache', () => {
    it('clears all cached data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createMockResponse([]),
      });

      await getCardLiftData('Blood Moon');
      expect(getCardLiftCacheSize()).toBe(1);

      clearCardLiftCache();
      expect(getCardLiftCacheSize()).toBe(0);
    });
  });
});
