/**
 * Unit tests for Scryfall API client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchCards, fetchCard, fetchCardsByNames } from './scryfall';

// Mock fetch globally
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchCards', () => {
  it('returns array of card names from autocomplete', async () => {
    const mockResponse = {
      object: 'catalog',
      total_values: 3,
      data: ['Lightning Bolt', 'Lightning Helix', 'Lightning Strike'],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const results = await searchCards('lightning');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.scryfall.com/cards/autocomplete?q=lightning'
    );
    expect(results).toEqual(['Lightning Bolt', 'Lightning Helix', 'Lightning Strike']);
  });

  it('handles empty results', async () => {
    const mockResponse = {
      object: 'catalog',
      total_values: 0,
      data: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const results = await searchCards('xyznonexistent');

    expect(results).toEqual([]);
  });

  it('returns empty array for empty query', async () => {
    const results = await searchCards('');

    expect(mockFetch).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it('returns empty array for whitespace-only query', async () => {
    const results = await searchCards('   ');

    expect(mockFetch).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it('encodes special characters in query', async () => {
    const mockResponse = {
      object: 'catalog',
      total_values: 1,
      data: ['Fire // Ice'],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    await searchCards('Fire // Ice');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.scryfall.com/cards/autocomplete?q=Fire%20%2F%2F%20Ice'
    );
  });

  it('throws error on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(searchCards('test')).rejects.toThrow(
      'Scryfall autocomplete failed: 500 Internal Server Error'
    );
  });

  it('throws error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(searchCards('test')).rejects.toThrow('Network error');
  });
});

describe('fetchCard', () => {
  const mockScryfallCard = {
    oracle_id: 'abc123',
    name: 'Lightning Bolt',
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/lightning-bolt.jpg',
      art_crop: 'https://cards.scryfall.io/art_crop/lightning-bolt.jpg',
    },
    mana_cost: '{R}',
    cmc: 1,
    colors: ['R'],
    color_identity: ['R'],
    type_line: 'Instant',
    oracle_text: 'Lightning Bolt deals 3 damage to any target.',
  };

  it('returns properly mapped Card object', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockScryfallCard,
    });

    const card = await fetchCard('Lightning Bolt');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.scryfall.com/cards/named?exact=Lightning%20Bolt'
    );
    expect(card).toEqual({
      oracleId: 'abc123',
      name: 'Lightning Bolt',
      imageUri: 'https://cards.scryfall.io/normal/lightning-bolt.jpg',
      artCropUri: 'https://cards.scryfall.io/art_crop/lightning-bolt.jpg',
      manaCost: '{R}',
      cmc: 1,
      colors: ['R'],
      colorIdentity: ['R'],
      typeLine: 'Instant',
      oracleText: 'Lightning Bolt deals 3 damage to any target.',
      power: undefined,
      toughness: undefined,
      loyalty: undefined,
    });
  });

  it('handles creature cards with power/toughness', async () => {
    const creatureCard = {
      oracle_id: 'creature123',
      name: 'Tarmogoyf',
      image_uris: {
        normal: 'https://cards.scryfall.io/normal/tarmogoyf.jpg',
        art_crop: 'https://cards.scryfall.io/art_crop/tarmogoyf.jpg',
      },
      mana_cost: '{1}{G}',
      cmc: 2,
      colors: ['G'],
      color_identity: ['G'],
      type_line: 'Creature - Lhurgoyf',
      oracle_text: "Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.",
      power: '*',
      toughness: '1+*',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => creatureCard,
    });

    const card = await fetchCard('Tarmogoyf');

    expect(card.power).toBe('*');
    expect(card.toughness).toBe('1+*');
  });

  it('handles planeswalker cards with loyalty', async () => {
    const planeswalkerCard = {
      oracle_id: 'pw123',
      name: 'Jace, the Mind Sculptor',
      image_uris: {
        normal: 'https://cards.scryfall.io/normal/jace.jpg',
        art_crop: 'https://cards.scryfall.io/art_crop/jace.jpg',
      },
      mana_cost: '{2}{U}{U}',
      cmc: 4,
      colors: ['U'],
      color_identity: ['U'],
      type_line: 'Legendary Planeswalker - Jace',
      oracle_text: '+2: Look at the top card...',
      loyalty: '3',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => planeswalkerCard,
    });

    const card = await fetchCard('Jace, the Mind Sculptor');

    expect(card.loyalty).toBe('3');
  });

  it('handles double-faced cards with card_faces', async () => {
    const doubleFacedCard = {
      oracle_id: 'dfc123',
      name: 'Delver of Secrets // Insectile Aberration',
      card_faces: [
        {
          name: 'Delver of Secrets',
          mana_cost: '{U}',
          oracle_text: 'At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform Delver of Secrets.',
          image_uris: {
            normal: 'https://cards.scryfall.io/normal/delver-front.jpg',
            art_crop: 'https://cards.scryfall.io/art_crop/delver-front.jpg',
          },
        },
        {
          name: 'Insectile Aberration',
          mana_cost: '',
          oracle_text: 'Flying',
          image_uris: {
            normal: 'https://cards.scryfall.io/normal/delver-back.jpg',
            art_crop: 'https://cards.scryfall.io/art_crop/delver-back.jpg',
          },
        },
      ],
      cmc: 1,
      colors: ['U'],
      color_identity: ['U'],
      type_line: 'Creature - Human Wizard // Creature - Human Insect',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => doubleFacedCard,
    });

    const card = await fetchCard('Delver of Secrets');

    expect(card.name).toBe('Delver of Secrets // Insectile Aberration');
    expect(card.imageUri).toBe('https://cards.scryfall.io/normal/delver-front.jpg');
    expect(card.artCropUri).toBe('https://cards.scryfall.io/art_crop/delver-front.jpg');
    expect(card.manaCost).toBe('{U}');
    expect(card.oracleText).toContain('At the beginning of your upkeep');
    expect(card.oracleText).toContain('Flying');
  });

  it('handles modal double-faced cards without top-level image_uris', async () => {
    const mdfc = {
      oracle_id: 'mdfc123',
      name: 'Emeria, Shattered Skyclave // Emeria, the Sky Ruin',
      card_faces: [
        {
          name: 'Emeria, Shattered Skyclave',
          mana_cost: '{2}{W}{W}',
          oracle_text: 'Flying\nWhen this creature enters the battlefield, return target creature from your graveyard to the battlefield.',
          image_uris: {
            normal: 'https://cards.scryfall.io/normal/emeria-creature.jpg',
            art_crop: 'https://cards.scryfall.io/art_crop/emeria-creature.jpg',
          },
        },
        {
          name: 'Emeria, the Sky Ruin',
          oracle_text: 'Emeria enters the battlefield tapped.',
          image_uris: {
            normal: 'https://cards.scryfall.io/normal/emeria-land.jpg',
            art_crop: 'https://cards.scryfall.io/art_crop/emeria-land.jpg',
          },
        },
      ],
      cmc: 4,
      colors: ['W'],
      color_identity: ['W'],
      type_line: 'Creature - Angel // Land',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mdfc,
    });

    const card = await fetchCard('Emeria, Shattered Skyclave');

    // Should use first face's image since no top-level image_uris
    expect(card.imageUri).toBe('https://cards.scryfall.io/normal/emeria-creature.jpg');
    expect(card.manaCost).toBe('{2}{W}{W}');
  });

  it('handles cards with missing colors array', async () => {
    const colorlessCard = {
      oracle_id: 'colorless123',
      name: 'Sol Ring',
      image_uris: {
        normal: 'https://cards.scryfall.io/normal/sol-ring.jpg',
        art_crop: 'https://cards.scryfall.io/art_crop/sol-ring.jpg',
      },
      mana_cost: '{1}',
      cmc: 1,
      color_identity: [],
      type_line: 'Artifact',
      oracle_text: '{T}: Add {C}{C}.',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => colorlessCard,
    });

    const card = await fetchCard('Sol Ring');

    expect(card.colors).toEqual([]);
  });

  it('throws error for 404 not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(fetchCard('Nonexistent Card')).rejects.toThrow(
      'Card not found: Nonexistent Card'
    );
  });

  it('throws error on other API failures', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });

    await expect(fetchCard('Lightning Bolt')).rejects.toThrow(
      'Scryfall fetch failed: 503 Service Unavailable'
    );
  });

  it('throws error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    await expect(fetchCard('Lightning Bolt')).rejects.toThrow('Connection refused');
  });
});

describe('fetchCardsByNames', () => {
  // Helper to create mock Scryfall card responses
  function createMockScryfallCard(name: string, oracleId: string) {
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
      oracle_text: 'Test card.',
    };
  }

  it('returns empty result for empty input', async () => {
    const result = await fetchCardsByNames([]);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.cards).toEqual([]);
    expect(result.notFound).toEqual([]);
  });

  it('fetches multiple cards in a single batch request', async () => {
    const mockCollectionResponse = {
      object: 'list',
      data: [
        createMockScryfallCard('Lightning Bolt', 'bolt-id'),
        createMockScryfallCard('Chain Lightning', 'chain-id'),
      ],
      not_found: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockCollectionResponse,
    });

    const result = await fetchCardsByNames(['Lightning Bolt', 'Chain Lightning']);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.scryfall.com/cards/collection',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifiers: [
            { name: 'Lightning Bolt' },
            { name: 'Chain Lightning' },
          ],
        }),
      })
    );

    expect(result.cards).toHaveLength(2);
    expect(result.cards[0].name).toBe('Lightning Bolt');
    expect(result.cards[1].name).toBe('Chain Lightning');
    expect(result.notFound).toEqual([]);
  });

  it('handles not_found cards gracefully', async () => {
    const mockCollectionResponse = {
      object: 'list',
      data: [createMockScryfallCard('Lightning Bolt', 'bolt-id')],
      not_found: [{ name: 'Nonexistent Card' }],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockCollectionResponse,
    });

    const result = await fetchCardsByNames(['Lightning Bolt', 'Nonexistent Card']);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].name).toBe('Lightning Bolt');
    expect(result.notFound).toEqual(['Nonexistent Card']);
  });

  it('deduplicates input names', async () => {
    const mockCollectionResponse = {
      object: 'list',
      data: [createMockScryfallCard('Lightning Bolt', 'bolt-id')],
      not_found: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockCollectionResponse,
    });

    await fetchCardsByNames(['Lightning Bolt', 'Lightning Bolt', 'Lightning Bolt']);

    // Should only request the card once
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.scryfall.com/cards/collection',
      expect.objectContaining({
        body: JSON.stringify({
          identifiers: [{ name: 'Lightning Bolt' }],
        }),
      })
    );
  });

  it('throws error on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(fetchCardsByNames(['Lightning Bolt'])).rejects.toThrow(
      'Scryfall collection fetch failed: 500 Internal Server Error'
    );
  });

  it('throws error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(fetchCardsByNames(['Lightning Bolt'])).rejects.toThrow('Network error');
  });

  it('correctly maps card data from collection response', async () => {
    const mockCollectionResponse = {
      object: 'list',
      data: [
        {
          oracle_id: 'test-oracle-id',
          name: 'Test Card',
          image_uris: {
            normal: 'https://cards.scryfall.io/normal/test.jpg',
            art_crop: 'https://cards.scryfall.io/art_crop/test.jpg',
          },
          mana_cost: '{2}{U}{U}',
          cmc: 4,
          colors: ['U'],
          color_identity: ['U'],
          type_line: 'Enchantment',
          oracle_text: 'Test oracle text.',
          power: undefined,
          toughness: undefined,
          loyalty: undefined,
        },
      ],
      not_found: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockCollectionResponse,
    });

    const result = await fetchCardsByNames(['Test Card']);

    expect(result.cards[0]).toEqual({
      oracleId: 'test-oracle-id',
      name: 'Test Card',
      imageUri: 'https://cards.scryfall.io/normal/test.jpg',
      artCropUri: 'https://cards.scryfall.io/art_crop/test.jpg',
      manaCost: '{2}{U}{U}',
      cmc: 4,
      colors: ['U'],
      colorIdentity: ['U'],
      typeLine: 'Enchantment',
      oracleText: 'Test oracle text.',
      power: undefined,
      toughness: undefined,
      loyalty: undefined,
    });
  });
});
