/**
 * Integration test for EDHREC Recommender
 *
 * This test hits the real EDHREC API to validate the response shape
 * and reproduce any type errors that occur in the browser.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRecommendations } from './recommender';
import { clearBaselineCache } from './baselineCache';
import type { Card } from '../types';

const EDHREC_API_URL = 'https://edhrec.com/api/recs';

/**
 * EDHREC request body type
 */
interface EDHRECRequest {
  cards: string[];
  commanders: string[];
  name: string;
  options: {
    excludeLands: boolean;
    offset: number;
  };
}

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

describe('EDHREC API Integration', () => {
  it('fetches recommendations for Kenrith with no cards (baseline)', async () => {
    const requestBody: EDHRECRequest = {
      cards: [],
      commanders: ['Kenrith, the Returned King'],
      name: '',
      options: {
        excludeLands: false,
        offset: 0,
      },
    };

    console.log('Request body:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(EDHREC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Response status:', response.status);
    console.log('Response statusText:', response.statusText);

    expect(response.ok).toBe(true);

    const rawData = await response.text();
    console.log('Raw response (first 2000 chars):', rawData.substring(0, 2000));

    // Parse the JSON
    const data = JSON.parse(rawData);

    console.log('Response keys:', Object.keys(data));
    console.log('inRecs type:', typeof data.inRecs);
    console.log('inRecs is array:', Array.isArray(data.inRecs));

    if (Array.isArray(data.inRecs) && data.inRecs.length > 0) {
      console.log('First inRec:', JSON.stringify(data.inRecs[0], null, 2));
      console.log('First inRec keys:', Object.keys(data.inRecs[0]));
    }

    console.log('outRecs type:', typeof data.outRecs);
    console.log('more type:', typeof data.more);
    console.log('more value:', data.more);

    // Validate expected structure
    expect(data).toHaveProperty('inRecs');
    expect(data).toHaveProperty('outRecs');
    expect(Array.isArray(data.inRecs)).toBe(true);
    expect(Array.isArray(data.outRecs)).toBe(true);
  });

  it('fetches recommendations with a sample card', async () => {
    const requestBody: EDHRECRequest = {
      cards: ['Lightning Bolt'],
      commanders: ['Kenrith, the Returned King'],
      name: '',
      options: {
        excludeLands: false,
        offset: 0,
      },
    };

    console.log('Request body:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(EDHREC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Response status:', response.status);

    expect(response.ok).toBe(true);

    const rawData = await response.text();
    console.log('Raw response (first 2000 chars):', rawData.substring(0, 2000));

    const data = JSON.parse(rawData);

    console.log('Response keys:', Object.keys(data));

    if (Array.isArray(data.inRecs) && data.inRecs.length > 0) {
      console.log('First 3 inRecs:');
      data.inRecs.slice(0, 3).forEach((rec: unknown, i: number) => {
        console.log(`  [${i}]:`, JSON.stringify(rec, null, 4));
      });
    }

    // Check for expected fields on inRecs
    if (Array.isArray(data.inRecs) && data.inRecs.length > 0) {
      const firstRec = data.inRecs[0];
      console.log('First rec has name:', 'name' in firstRec);
      console.log('First rec has oracle_id:', 'oracle_id' in firstRec);
      console.log('First rec has score:', 'score' in firstRec);
      console.log('First rec has salt:', 'salt' in firstRec);
      console.log('First rec has primary_type:', 'primary_type' in firstRec);
    }
  });
});

describe('getRecommendations with real API response structure', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    clearBaselineCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearBaselineCache();
  });

  /**
   * This test uses the EXACT response structure from the real EDHREC API
   * to verify our code handles it correctly.
   */
  it('handles real EDHREC API response structure', async () => {
    const sourceCard = createMockCard('Lightning Bolt', 'source-oracle-id', 'Deal 3 damage to any target.');
    // Real EDHREC API response structure (copied from actual API call)
    const realEdhrecResponse = {
      commanders: [
        {
          name: 'Kenrith, the Returned King',
          names: ['Kenrith, the Returned King'],
          oracle_id: 'd209b948-9afb-4fd1-a961-72c87282878c',
          primary_type: 'Creature',
          salt: 1.092,
        },
      ],
      deck: {
        Plains: 1,
        Island: 1,
        Swamp: 1,
        Mountain: 1,
        Forest: 1,
        Wastes: 1,
        'Sol Ring': 1,
      },
      inRecs: [
        {
          name: 'Rift Bolt',
          names: ['Rift Bolt'],
          oracle_id: 'rift-bolt-id',
          primary_type: 'Sorcery',
          salt: 0.1,
          score: 85,
        },
        {
          name: 'Lava Spike',
          names: ['Lava Spike'],
          oracle_id: 'lava-spike-id',
          primary_type: 'Sorcery',
          salt: 0.1,
          score: 80,
        },
      ],
      outRecs: [],
      more: false,
    };

    // Mock baseline fetch (empty baseline)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        commanders: [],
        deck: {},
        inRecs: [],
        outRecs: [],
        more: false,
      }),
    });

    // Mock recommendations fetch with real structure
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => realEdhrecResponse,
    });

    // Mock Scryfall batch fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockCollectionResponse([
        { name: 'Rift Bolt', oracleId: 'rift-bolt-oracle', oracleText: 'Suspend 1' },
        { name: 'Lava Spike', oracleId: 'lava-spike-oracle', oracleText: 'Deal 3 damage' },
      ]),
    });

    const recommendations = await getRecommendations(sourceCard, []);

    console.log('Recommendations:', recommendations);

    expect(recommendations).toHaveLength(2);
    expect(recommendations[0].card.name).toBe('Rift Bolt');
    expect(recommendations[0].score).toBe(85);
  });

  /**
   * Test with response that has the extra 'names' field that the real API returns
   */
  it('handles cards with names array field', async () => {
    const sourceCard = createMockCard('Lightning Bolt', 'source-oracle-id');
    // Response with the 'names' array that real API includes
    const apiResponse = {
      commanders: [],
      deck: {},
      inRecs: [
        {
          name: 'Test Card',
          names: ['Test Card'],  // This extra field exists in real API
          oracle_id: 'test-id',
          primary_type: 'Instant',
          salt: 0,
          score: 90,
        },
      ],
      outRecs: [],
      more: false,
    };

    // Baseline
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ inRecs: [], outRecs: [], more: false }),
    });

    // Recommendations
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => apiResponse,
    });

    // Scryfall
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockCollectionResponse([
        { name: 'Test Card', oracleId: 'test-oracle-id' },
      ]),
    });

    const recommendations = await getRecommendations(sourceCard, []);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].card.name).toBe('Test Card');
  });
});
