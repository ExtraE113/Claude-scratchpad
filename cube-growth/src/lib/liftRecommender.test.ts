/**
 * Unit tests for Lift-based Recommender
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getLiftRecommendations } from './liftRecommender';
import { clearCardLiftCache } from './cardLiftCache';
import type { Card, CubeGraph } from '../types';

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

// Helper to create a mock EDHREC card JSON response (matches real nested structure)
function createMockEDHRECResponse(cards: Array<{ name: string; lift: number; synergy?: number }>) {
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
              inclusion: 1000,
            })),
          },
        ],
      },
    },
  };
}

// Helper to create a mock Scryfall collection response
function createMockScryfallResponse(cards: Array<{ name: string; oracleId: string; oracleText?: string }>) {
  return {
    object: 'list',
    data: cards.map((c) => ({
      oracle_id: c.oracleId,
      name: c.name,
      image_uris: {
        normal: `https://cards.scryfall.io/normal/${c.name.toLowerCase().replace(/\s/g, '-')}.jpg`,
        art_crop: `https://cards.scryfall.io/art_crop/${c.name.toLowerCase().replace(/\s/g, '-')}.jpg`,
      },
      mana_cost: '{1}{R}',
      cmc: 2,
      colors: ['R'],
      color_identity: ['R'],
      type_line: 'Creature',
      oracle_text: c.oracleText ?? '',
    })),
    not_found: [],
  };
}

// Helper to create a simple graph
function createGraph(cards: Card[], edges: Array<[string, string]> = []): CubeGraph {
  const nodes = new Map<string, Card>();
  for (const card of cards) {
    nodes.set(card.oracleId, card);
  }

  const edgeSet = new Set<string>();
  for (const [idA, idB] of edges) {
    const sorted = [idA, idB].sort();
    edgeSet.add(`${sorted[0]}|${sorted[1]}`);
  }

  return { nodes, edges: edgeSet };
}

describe('getLiftRecommendations', () => {
  it('returns recommendations based on aggregated lift scores', async () => {
    const sourceCard = createMockCard('Blood Moon', 'blood-moon-id');
    const graph = createGraph([sourceCard]);

    // Mock EDHREC response for Blood Moon
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockEDHRECResponse([
        { name: 'Magus of the Moon', lift: 100 },
        { name: 'Trinisphere', lift: 50 },
      ]),
    });

    // Mock Scryfall batch fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockScryfallResponse([
        { name: 'Magus of the Moon', oracleId: 'magus-id' },
        { name: 'Trinisphere', oracleId: 'trinisphere-id' },
      ]),
    });

    const recommendations = await getLiftRecommendations(sourceCard, graph);

    expect(recommendations).toHaveLength(2);
    // Source card has weight 10, so scores are lift * 10
    expect(recommendations[0].card.name).toBe('Magus of the Moon');
    expect(recommendations[0].score).toBe(1000); // 100 * 10
    expect(recommendations[1].card.name).toBe('Trinisphere');
    expect(recommendations[1].score).toBe(500); // 50 * 10
  });

  it('weights cards by graph distance', async () => {
    const sourceCard = createMockCard('Blood Moon', 'blood-moon-id');
    const neighborCard = createMockCard('Magus of the Moon', 'magus-id');
    const distantCard = createMockCard('Trinisphere', 'trinisphere-id');

    // Graph: Blood Moon -- Magus -- Trinisphere (chain)
    const graph = createGraph(
      [sourceCard, neighborCard, distantCard],
      [
        ['blood-moon-id', 'magus-id'],
        ['magus-id', 'trinisphere-id'],
      ]
    );

    // Mock EDHREC response for each card
    // Blood Moon (distance 0, weight 10) recommends "Rec A" with lift 10
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockEDHRECResponse([{ name: 'Rec A', lift: 10 }]),
    });

    // Magus (distance 1, weight 8) recommends "Rec A" with lift 10
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockEDHRECResponse([{ name: 'Rec A', lift: 10 }]),
    });

    // Trinisphere (distance 2, weight 6) recommends "Rec A" with lift 10
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockEDHRECResponse([{ name: 'Rec A', lift: 10 }]),
    });

    // Mock Scryfall batch fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockScryfallResponse([
        { name: 'Rec A', oracleId: 'rec-a-id' },
      ]),
    });

    const recommendations = await getLiftRecommendations(sourceCard, graph);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].card.name).toBe('Rec A');
    // Aggregated: 10*10 + 10*8 + 10*6 = 100 + 80 + 60 = 240
    expect(recommendations[0].score).toBe(240);
  });

  it('excludes cards already in the cube', async () => {
    const sourceCard = createMockCard('Blood Moon', 'blood-moon-id');
    const cubeCard = createMockCard('Magus of the Moon', 'magus-id');
    const graph = createGraph([sourceCard, cubeCard]);

    // EDHREC recommends both Magus (in cube) and Trinisphere (not in cube)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockEDHRECResponse([
        { name: 'Magus of the Moon', lift: 100 },
        { name: 'Trinisphere', lift: 50 },
      ]),
    });

    // Magus has no lift data (unconnected, weight 1)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockEDHRECResponse([]),
    });

    // Mock Scryfall - only Trinisphere should be fetched
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockScryfallResponse([
        { name: 'Trinisphere', oracleId: 'trinisphere-id' },
      ]),
    });

    const recommendations = await getLiftRecommendations(sourceCard, graph);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].card.name).toBe('Trinisphere');
  });

  it('filters out commander-only cards by name', async () => {
    const sourceCard = createMockCard('Blood Moon', 'blood-moon-id');
    const graph = createGraph([sourceCard]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockEDHRECResponse([
        { name: 'Command Tower', lift: 100 }, // Commander-only
        { name: 'Arcane Signet', lift: 90 },   // Commander-only
        { name: 'Trinisphere', lift: 50 },
      ]),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockScryfallResponse([
        { name: 'Trinisphere', oracleId: 'trinisphere-id' },
      ]),
    });

    const recommendations = await getLiftRecommendations(sourceCard, graph);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].card.name).toBe('Trinisphere');
  });

  it('filters out commander-only cards by oracle text', async () => {
    const sourceCard = createMockCard('Blood Moon', 'blood-moon-id');
    const graph = createGraph([sourceCard]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockEDHRECResponse([
        { name: 'Commander Card', lift: 100 },
        { name: 'Normal Card', lift: 50 },
      ]),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockScryfallResponse([
        { name: 'Commander Card', oracleId: 'cmd-id', oracleText: 'If you control your commander, this gets +2/+2' },
        { name: 'Normal Card', oracleId: 'normal-id', oracleText: 'Flying' },
      ]),
    });

    const recommendations = await getLiftRecommendations(sourceCard, graph);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].card.name).toBe('Normal Card');
  });

  it('handles empty lift data gracefully', async () => {
    const sourceCard = createMockCard('Blood Moon', 'blood-moon-id');
    const graph = createGraph([sourceCard]);

    // EDHREC returns no lift data
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ cardlists: [] }),
    });

    const recommendations = await getLiftRecommendations(sourceCard, graph);

    expect(recommendations).toHaveLength(0);
  });

  it('handles EDHREC API errors gracefully', async () => {
    const sourceCard = createMockCard('Blood Moon', 'blood-moon-id');
    const graph = createGraph([sourceCard]);

    // Suppress console.warn for this test
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const recommendations = await getLiftRecommendations(sourceCard, graph);

    expect(recommendations).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it('limits recommendations to 10', async () => {
    const sourceCard = createMockCard('Blood Moon', 'blood-moon-id');
    const graph = createGraph([sourceCard]);

    // Create 20 recommendations
    const manyRecs = Array.from({ length: 20 }, (_, i) => ({
      name: `Rec ${i + 1}`,
      lift: 100 - i,
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockEDHRECResponse(manyRecs),
    });

    // Scryfall returns all cards
    const scryfallCards = Array.from({ length: 20 }, (_, i) => ({
      name: `Rec ${i + 1}`,
      oracleId: `rec-${i + 1}-id`,
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockScryfallResponse(scryfallCards),
    });

    const recommendations = await getLiftRecommendations(sourceCard, graph);

    expect(recommendations).toHaveLength(10);
    expect(recommendations[0].card.name).toBe('Rec 1');
    expect(recommendations[9].card.name).toBe('Rec 10');
  });

  it('aggregates scores from multiple cube cards', async () => {
    const card1 = createMockCard('Card A', 'card-a-id');
    const card2 = createMockCard('Card B', 'card-b-id');
    const graph = createGraph([card1, card2], [['card-a-id', 'card-b-id']]);

    // Card A (distance 0, weight 10) recommends "Rec X" with lift 10
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockEDHRECResponse([{ name: 'Rec X', lift: 10 }]),
    });

    // Card B (distance 1, weight 8) recommends "Rec X" with lift 20
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockEDHRECResponse([{ name: 'Rec X', lift: 20 }]),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockScryfallResponse([
        { name: 'Rec X', oracleId: 'rec-x-id' },
      ]),
    });

    const recommendations = await getLiftRecommendations(card1, graph);

    expect(recommendations).toHaveLength(1);
    // Aggregated: 10*10 + 20*8 = 100 + 160 = 260
    expect(recommendations[0].score).toBe(260);
  });

  it('gives low weight to unconnected cards', async () => {
    const sourceCard = createMockCard('Card A', 'card-a-id');
    const unconnectedCard = createMockCard('Card B', 'card-b-id');
    // No edges - cards are disconnected
    const graph = createGraph([sourceCard, unconnectedCard]);

    // Source (distance 0, weight 10) recommends "Rec X" with lift 10
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockEDHRECResponse([{ name: 'Rec X', lift: 10 }]),
    });

    // Unconnected (distance -1, weight 1) recommends "Rec X" with lift 100
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockEDHRECResponse([{ name: 'Rec X', lift: 100 }]),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockScryfallResponse([
        { name: 'Rec X', oracleId: 'rec-x-id' },
      ]),
    });

    const recommendations = await getLiftRecommendations(sourceCard, graph);

    expect(recommendations).toHaveLength(1);
    // Aggregated: 10*10 + 100*1 = 100 + 100 = 200
    // Unconnected card's high lift (100) only contributes 100 due to weight 1
    // While source's low lift (10) contributes 100 due to weight 10
    expect(recommendations[0].score).toBe(200);
  });
});
