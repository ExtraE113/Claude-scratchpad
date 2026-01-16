/**
 * Scryfall API client
 *
 * Provides card search and fetch functionality using the Scryfall API.
 * Implements rate limiting with a 100ms delay between requests.
 */

import type { Card } from '../types';

const SCRYFALL_BASE_URL = 'https://api.scryfall.com';
const RATE_LIMIT_DELAY = 100; // ms between requests

/**
 * Scryfall card response type (partial, only fields we need)
 */
interface ScryfallCard {
  oracle_id: string;
  name: string;
  image_uris?: {
    normal?: string;
    art_crop?: string;
  };
  card_faces?: Array<{
    name: string;
    mana_cost?: string;
    oracle_text?: string;
    image_uris?: {
      normal?: string;
      art_crop?: string;
    };
  }>;
  mana_cost?: string;
  cmc: number;
  colors?: string[];
  color_identity: string[];
  type_line: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
}

/**
 * Scryfall autocomplete response type
 */
interface ScryfallAutocompleteResponse {
  object: string;
  total_values: number;
  data: string[];
}

/**
 * Simple request queue for rate limiting.
 * Ensures a minimum delay between requests to respect Scryfall's rate limits.
 */
class RequestQueue {
  private lastRequestTime = 0;
  private queue: Array<() => Promise<void>> = [];
  private processing = false;

  async enqueue<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
        await this.delay(RATE_LIMIT_DELAY - timeSinceLastRequest);
      }

      const request = this.queue.shift();
      if (request) {
        this.lastRequestTime = Date.now();
        await request();
      }
    }

    this.processing = false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

const requestQueue = new RequestQueue();

/**
 * Maps a Scryfall card response to our Card type.
 * Handles double-faced cards by using the first face's image if card_faces exists.
 */
function scryfallToCard(sf: ScryfallCard): Card {
  // Handle double-faced cards: use first face's image if card_faces exists
  const imageUri = sf.image_uris?.normal ?? sf.card_faces?.[0]?.image_uris?.normal ?? '';
  const artCropUri = sf.image_uris?.art_crop ?? sf.card_faces?.[0]?.image_uris?.art_crop ?? '';

  // Handle mana cost for double-faced cards
  const manaCost = sf.mana_cost ?? sf.card_faces?.[0]?.mana_cost ?? '';

  // Handle oracle text for double-faced cards (combine both faces)
  const oracleText = sf.oracle_text ?? sf.card_faces?.map((f) => f.oracle_text).join('\n\n') ?? '';

  return {
    oracleId: sf.oracle_id,
    name: sf.name,
    imageUri,
    artCropUri,
    manaCost,
    cmc: sf.cmc,
    colors: sf.colors ?? [],
    colorIdentity: sf.color_identity,
    typeLine: sf.type_line,
    oracleText,
    power: sf.power,
    toughness: sf.toughness,
    loyalty: sf.loyalty,
  };
}

/**
 * Search for cards using Scryfall's autocomplete endpoint.
 * Returns an array of card names matching the query.
 *
 * @param query - The search query (partial card name)
 * @returns Array of card names (up to 20 results)
 */
export async function searchCards(query: string): Promise<string[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }

  return requestQueue.enqueue(async () => {
    const encodedQuery = encodeURIComponent(query);
    const url = `${SCRYFALL_BASE_URL}/cards/autocomplete?q=${encodedQuery}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Scryfall autocomplete failed: ${response.status} ${response.statusText}`);
    }

    const data: ScryfallAutocompleteResponse = await response.json();
    return data.data;
  });
}

/**
 * Fetch a card by its exact name from Scryfall.
 *
 * @param name - The exact card name to fetch
 * @returns The Card object with full metadata
 * @throws Error if the card is not found
 */
export async function fetchCard(name: string): Promise<Card> {
  return requestQueue.enqueue(async () => {
    const encodedName = encodeURIComponent(name);
    const url = `${SCRYFALL_BASE_URL}/cards/named?exact=${encodedName}`;

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Card not found: ${name}`);
      }
      throw new Error(`Scryfall fetch failed: ${response.status} ${response.statusText}`);
    }

    const data: ScryfallCard = await response.json();
    return scryfallToCard(data);
  });
}
