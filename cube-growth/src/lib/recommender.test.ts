/**
 * Unit tests for EDHREC Recommender client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRecommendations } from './recommender';
import type { Card } from '../types';
import { clearBaselineCache } from './baselineCache';

// Mock fetch globally
const mockFetch = vi.fn();

/**
 * Helper to set up baseline cache mock response.
 * The baseline cache is fetched once and then cached.
 */
function mockBaselineResponse(cards: Array<{ name: string; score: number }> = []) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      inRecs: cards,
      more: false,
    }),
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
  clearBaselineCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearBaselineCache();
});

// Helper to create mock Card objects
function createMockCard(name: string, oracleId: string, oracleText = ''): Card {
  return {
    oracleId,
    name,
    imageUri: `https://cards.scryfall.io/normal/${name.toLowerCase().replace(/\s/g, '-')}.jpg`,
    artCropUri: `https://cards.scryfall.io/art_crop/${name.toLowerCase().replace(/\s/g, '-')}.jpg`,
    manaCost: '{1}{R}',
    cmc: 2,
    colors: ['R'],
    colorIdentity: ['R'],
    typeLine: 'Instant',
    oracleText,
  };
}

// Helper to create a mock Scryfall card object (for collection response)
function createMockScryfallCard(name: string, oracleId: string, oracleText = '') {
  return {
    oracle_id: oracleId,
    name,
    image_uris: {
      normal: `https://cards.scryfall.io/normal/${name.toLowerCase().replace(/\s/g, '-')}.jpg`,
      art_crop: `https://cards.scryfall.io/art_crop/${name.toLowerCase().replace(/\s/g, '-')}.jpg`,
    },
    mana_cost: '{1}{R}',
    cmc: 2,
    colors: ['R'],
    color_identity: ['R'],
    type_line: 'Instant',
    oracle_text: oracleText,
  };
}

// Helper to create a mock Scryfall collection response
function createMockCollectionResponse(cards: Array<{ name: string; oracleId: string; oracleText?: string }>, notFoundNames: string[] = []) {
  return {
    object: 'list',
    data: cards.map(c => createMockScryfallCard(c.name, c.oracleId, c.oracleText ?? '')),
    not_found: notFoundNames.map(name => ({ name })),
  };
}

describe('getRecommendations', () => {
  const sourceCard = createMockCard('Lightning Bolt', 'source-oracle-id', 'Deal 3 damage to any target.');
  const contextCard = createMockCard('Chain Lightning', 'context-oracle-id', 'Deal 3 damage to any target.');

  it('returns filtered recommendations from EDHREC', async () => {

    const edhrecResponse = {
      inRecs: [
        { name: 'Rift Bolt', oracle_id: 'rec1', primary_type: 'Sorcery', score: 85, salt: 0.1 },
        { name: 'Lava Spike', oracle_id: 'rec2', primary_type: 'Sorcery', score: 80, salt: 0.1 },
      ],
      outRecs: [],
      more: false,
    };

    // First: baseline cache fetch (empty baseline)
    mockBaselineResponse([]);

    mockFetch
      // EDHREC API call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => edhrecResponse,
      })
      // Scryfall batch fetch for both cards
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createMockCollectionResponse([
          { name: 'Rift Bolt', oracleId: 'rift-bolt-id', oracleText: 'Suspend 1' },
          { name: 'Lava Spike', oracleId: 'lava-spike-id', oracleText: 'Deal 3 damage' },
        ]),
      });

    const recommendations = await getRecommendations(sourceCard, [contextCard]);

    expect(recommendations).toHaveLength(2);
    expect(recommendations[0].card.name).toBe('Rift Bolt');
    // Score is raw score - baseline (85 - 0 = 85)
    expect(recommendations[0].score).toBe(85);
    expect(recommendations[1].card.name).toBe('Lava Spike');
    expect(recommendations[1].score).toBe(80);
  });

  it('filters out commander-only cards by name', async () => {

    const edhrecResponse = {
      inRecs: [
        { name: 'Command Tower', oracle_id: 'ct-id', primary_type: 'Land', score: 99, salt: 0 },
        { name: 'Arcane Signet', oracle_id: 'as-id', primary_type: 'Artifact', score: 98, salt: 0 },
        { name: 'Lightning Greaves', oracle_id: 'lg-id', primary_type: 'Artifact', score: 90, salt: 0.2 },
      ],
      outRecs: [],
      more: false,
    };

    mockBaselineResponse([]);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => edhrecResponse,
      })
      // Only Lightning Greaves should be fetched (others filtered by name before batch fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createMockCollectionResponse([
          { name: 'Lightning Greaves', oracleId: 'lg-oracle-id', oracleText: 'Shroud, Haste' },
        ]),
      });

    const recommendations = await getRecommendations(sourceCard, []);

    // Command Tower and Arcane Signet should be filtered out
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].card.name).toBe('Lightning Greaves');
  });

  it('filters out cards with commander text in oracle', async () => {

    const edhrecResponse = {
      inRecs: [
        { name: 'Custom Commander Card', oracle_id: 'custom-id', primary_type: 'Creature', score: 95, salt: 0 },
        { name: 'Normal Card', oracle_id: 'normal-id', primary_type: 'Creature', score: 90, salt: 0 },
      ],
      outRecs: [],
      more: false,
    };

    mockBaselineResponse([]);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => edhrecResponse,
      })
      // Batch fetch both cards - filtering happens after oracle text is retrieved
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createMockCollectionResponse([
          { name: 'Custom Commander Card', oracleId: 'custom-oracle-id', oracleText: 'If you control your commander, this creature gets +2/+2.' },
          { name: 'Normal Card', oracleId: 'normal-oracle-id', oracleText: 'Flying, vigilance' },
        ]),
      });

    const recommendations = await getRecommendations(sourceCard, []);

    // Custom Commander Card should be filtered after oracle text check
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].card.name).toBe('Normal Card');
  });

  it('filters out cards with command zone text in oracle', async () => {
    const edhrecResponse = {
      inRecs: [
        { name: 'Zone Card', oracle_id: 'zone-id', primary_type: 'Creature', score: 95, salt: 0 },
        { name: 'Regular Card', oracle_id: 'regular-id', primary_type: 'Creature', score: 85, salt: 0 },
      ],
      outRecs: [],
      more: false,
    };

    mockBaselineResponse([]);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => edhrecResponse,
      })
      // Batch fetch both cards
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createMockCollectionResponse([
          { name: 'Zone Card', oracleId: 'zone-oracle-id', oracleText: 'You may cast this spell from your command zone.' },
          { name: 'Regular Card', oracleId: 'regular-oracle-id', oracleText: 'When this enters the battlefield, draw a card.' },
        ]),
      });

    const recommendations = await getRecommendations(sourceCard, []);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].card.name).toBe('Regular Card');
  });

  it('limits recommendations to 10', async () => {
    const manyRecs = Array.from({ length: 15 }, (_, i) => ({
      name: `Card ${i + 1}`,
      oracle_id: `oracle-${i + 1}`,
      primary_type: 'Creature',
      score: 100 - i,
      salt: 0,
    }));

    const edhrecResponse = {
      inRecs: manyRecs,
      outRecs: [],
      more: false, // No more pages - we're testing the 10-limit, not pagination
    };

    // Create mock cards for the batch response (we fetch up to 25 cards to have buffer)
    const mockCards = Array.from({ length: 15 }, (_, i) => ({
      name: `Card ${i + 1}`,
      oracleId: `card-${i + 1}-oracle`,
    }));

    mockBaselineResponse([]);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => edhrecResponse,
      })
      // Single batch fetch for all cards
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createMockCollectionResponse(mockCards),
      });

    const recommendations = await getRecommendations(sourceCard, []);

    expect(recommendations).toHaveLength(10);
    expect(recommendations[0].card.name).toBe('Card 1');
    expect(recommendations[9].card.name).toBe('Card 10');
  });

  it('handles EDHREC API errors gracefully by returning empty recommendations', async () => {
    // Suppress console.warn for this test
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockBaselineResponse([]);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    // Should return empty recommendations, not throw (graceful degradation)
    const recommendations = await getRecommendations(sourceCard, []);
    expect(recommendations).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('handles network errors gracefully by returning empty recommendations', async () => {
    // Suppress console.warn for this test
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockBaselineResponse([]);

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    // Should return empty recommendations, not throw (graceful degradation)
    const recommendations = await getRecommendations(sourceCard, []);
    expect(recommendations).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('skips cards that fail to fetch from Scryfall', async () => {
    const edhrecResponse = {
      inRecs: [
        { name: 'Failing Card', oracle_id: 'fail-id', primary_type: 'Creature', score: 95, salt: 0 },
        { name: 'Working Card', oracle_id: 'work-id', primary_type: 'Creature', score: 90, salt: 0 },
      ],
      outRecs: [],
      more: false,
    };

    // Suppress console.warn for this test
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockBaselineResponse([]);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => edhrecResponse,
      })
      // Batch fetch - Failing Card is in not_found, Working Card succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createMockCollectionResponse(
          [{ name: 'Working Card', oracleId: 'working-oracle-id' }],
          ['Failing Card']
        ),
      });

    const recommendations = await getRecommendations(sourceCard, []);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].card.name).toBe('Working Card');
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('sets alreadyInGraph correctly for source card', async () => {
    const edhrecResponse = {
      inRecs: [
        { name: 'Lightning Bolt', oracle_id: 'source-oracle-id', primary_type: 'Instant', score: 95, salt: 0 },
        { name: 'New Card', oracle_id: 'new-id', primary_type: 'Instant', score: 90, salt: 0 },
      ],
      outRecs: [],
      more: false,
    };

    mockBaselineResponse([]);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => edhrecResponse,
      })
      // Batch fetch both cards
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createMockCollectionResponse([
          { name: 'Lightning Bolt', oracleId: 'source-oracle-id', oracleText: 'Deal 3 damage' },
          { name: 'New Card', oracleId: 'new-oracle-id' },
        ]),
      });

    const recommendations = await getRecommendations(sourceCard, []);

    // Lightning Bolt should be marked as already in graph
    const boltRec = recommendations.find(r => r.card.name === 'Lightning Bolt');
    const newRec = recommendations.find(r => r.card.name === 'New Card');

    expect(boltRec?.alreadyInGraph).toBe(true);
    expect(newRec?.alreadyInGraph).toBe(false);
  });

  it('sets alreadyInGraph correctly for context cards', async () => {
    const edhrecResponse = {
      inRecs: [
        { name: 'Chain Lightning', oracle_id: 'context-oracle-id', primary_type: 'Sorcery', score: 95, salt: 0 },
        { name: 'Fresh Card', oracle_id: 'fresh-id', primary_type: 'Instant', score: 90, salt: 0 },
      ],
      outRecs: [],
      more: false,
    };

    mockBaselineResponse([]);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => edhrecResponse,
      })
      // Batch fetch both cards
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createMockCollectionResponse([
          { name: 'Chain Lightning', oracleId: 'context-oracle-id', oracleText: 'Deal 3 damage' },
          { name: 'Fresh Card', oracleId: 'fresh-oracle-id' },
        ]),
      });

    const recommendations = await getRecommendations(sourceCard, [contextCard]);

    const chainRec = recommendations.find(r => r.card.name === 'Chain Lightning');
    const freshRec = recommendations.find(r => r.card.name === 'Fresh Card');

    expect(chainRec?.alreadyInGraph).toBe(true);
    expect(freshRec?.alreadyInGraph).toBe(false);
  });

  it('sends correct request body to EDHREC API', async () => {
    const edhrecResponse = {
      inRecs: [],
      outRecs: [],
      more: false,
    };

    mockBaselineResponse([]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => edhrecResponse,
    });

    await getRecommendations(sourceCard, [contextCard]);

    // The second call should be the EDHREC recommendation call (first is baseline)
    expect(mockFetch).toHaveBeenCalledWith('/api/edhrec/recs', expect.objectContaining({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }));

    // Parse the body to check the cards array (second call, index 1)
    const callArgs = mockFetch.mock.calls[1];
    const body = JSON.parse(callArgs[1].body);

    // Each card should appear exactly once (no duplicates)
    expect(body.cards).toEqual(['Lightning Bolt', 'Chain Lightning']);

    // Should include the commander
    expect(body.commanders).toEqual(['Kenrith, the Returned King']);
  });

  it('handles empty inRecs array', async () => {
    const edhrecResponse = {
      inRecs: [],
      outRecs: [
        { name: 'Out Rec', oracle_id: 'out-id', primary_type: 'Creature', score: 50, salt: 0 },
      ],
      more: false,
    };

    mockBaselineResponse([]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => edhrecResponse,
    });

    const recommendations = await getRecommendations(sourceCard, []);

    // Should only process inRecs, not outRecs
    expect(recommendations).toHaveLength(0);
  });

  it('subtracts baseline scores and reorders by adjusted score', async () => {
    const edhrecResponse = {
      inRecs: [
        // Sol Ring has high raw score but high baseline too
        { name: 'Sol Ring', oracle_id: 'sol-id', primary_type: 'Artifact', score: 100, salt: 0 },
        // Synergy Card has lower raw score but zero baseline
        { name: 'Synergy Card', oracle_id: 'syn-id', primary_type: 'Creature', score: 60, salt: 0 },
      ],
      outRecs: [],
      more: false,
    };

    // Baseline has Sol Ring with score 90
    mockBaselineResponse([
      { name: 'Sol Ring', score: 90 },
    ]);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => edhrecResponse,
      })
      // Batch fetch both cards - order in response doesn't matter, we sort by adjusted score
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createMockCollectionResponse([
          { name: 'Synergy Card', oracleId: 'synergy-oracle-id' },
          { name: 'Sol Ring', oracleId: 'sol-oracle-id' },
        ]),
      });

    const recommendations = await getRecommendations(sourceCard, []);

    expect(recommendations).toHaveLength(2);
    // Synergy Card should be first (adjusted score 60 > 10)
    expect(recommendations[0].card.name).toBe('Synergy Card');
    expect(recommendations[0].score).toBe(60);
    // Sol Ring should be second (adjusted score 10)
    expect(recommendations[1].card.name).toBe('Sol Ring');
    expect(recommendations[1].score).toBe(10);
  });

  it('handles negative adjusted scores', async () => {
    const edhrecResponse = {
      inRecs: [
        // Card with very high baseline (generic goodstuff)
        { name: 'Generic Card', oracle_id: 'gen-id', primary_type: 'Artifact', score: 50, salt: 0 },
      ],
      outRecs: [],
      more: false,
    };

    // Baseline has Generic Card with score higher than raw
    mockBaselineResponse([
      { name: 'Generic Card', score: 80 },
    ]);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => edhrecResponse,
      })
      // Batch fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createMockCollectionResponse([
          { name: 'Generic Card', oracleId: 'generic-oracle-id' },
        ]),
      });

    const recommendations = await getRecommendations(sourceCard, []);

    expect(recommendations).toHaveLength(1);
    // Adjusted score should be negative (50 - 80 = -30)
    expect(recommendations[0].score).toBe(-30);
  });
});
