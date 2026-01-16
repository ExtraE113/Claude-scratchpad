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

/**
 * Maximum number of identifiers per /cards/collection request.
 * Scryfall limits batch requests to 75 cards.
 */
const COLLECTION_BATCH_SIZE = 75;

/**
 * Scryfall collection response type
 */
interface ScryfallCollectionResponse {
  object: 'list';
  data: ScryfallCard[];
  not_found: Array<{ name?: string; id?: string }>;
}

/**
 * Result of a batch card fetch operation.
 * Contains successfully fetched cards and names that weren't found.
 */
export interface BatchFetchResult {
  /** Successfully fetched cards */
  cards: Card[];
  /** Card names that were not found */
  notFound: string[];
}

/**
 * Fetch multiple cards by their exact names using Scryfall's /cards/collection endpoint.
 * This is more efficient than fetching cards one-by-one when you need multiple cards.
 *
 * The collection endpoint accepts up to 75 identifiers per request.
 * If more than 75 names are provided, multiple requests will be made automatically.
 *
 * @param names - Array of exact card names to fetch
 * @returns BatchFetchResult with found cards and not-found names
 */
export async function fetchCardsByNames(names: string[]): Promise<BatchFetchResult> {
  if (names.length === 0) {
    return { cards: [], notFound: [] };
  }

  // Deduplicate names while preserving order
  const uniqueNames = [...new Set(names)];

  // Split into batches of COLLECTION_BATCH_SIZE
  const batches: string[][] = [];
  for (let i = 0; i < uniqueNames.length; i += COLLECTION_BATCH_SIZE) {
    batches.push(uniqueNames.slice(i, i + COLLECTION_BATCH_SIZE));
  }

  // Fetch all batches (through the rate-limited queue)
  const allCards: Card[] = [];
  const allNotFound: string[] = [];

  for (const batch of batches) {
    const result = await fetchCollectionBatch(batch);
    allCards.push(...result.cards);
    allNotFound.push(...result.notFound);
  }

  return { cards: allCards, notFound: allNotFound };
}

/**
 * Fetch a single batch of cards from the /cards/collection endpoint.
 * This is an internal helper that handles a single API request.
 *
 * @param names - Array of card names (max 75)
 * @returns BatchFetchResult for this batch
 */
async function fetchCollectionBatch(names: string[]): Promise<BatchFetchResult> {
  return requestQueue.enqueue(async () => {
    const url = `${SCRYFALL_BASE_URL}/cards/collection`;

    // Build the identifiers array using name-based lookups
    const identifiers = names.map((name) => ({ name }));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ identifiers }),
    });

    if (!response.ok) {
      throw new Error(`Scryfall collection fetch failed: ${response.status} ${response.statusText}`);
    }

    const data: ScryfallCollectionResponse = await response.json();

    // Map found cards
    const cards = data.data.map(scryfallToCard);

    // Extract not-found names
    const notFound = data.not_found
      .filter((entry): entry is { name: string } => typeof entry.name === 'string')
      .map((entry) => entry.name);

    return { cards, notFound };
  });
}
