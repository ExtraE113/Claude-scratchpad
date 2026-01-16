/**
 * Card Lift Cache for EDHREC Per-Card Synergies
 *
 * Fetches and caches lift scores for cards from EDHREC's card pages.
 * Lift scores indicate how much more likely a card is to appear with
 * a given card compared to the overall format baseline.
 *
 * This provides card-specific synergy data rather than commander-based
 * recommendations, enabling more relevant recommendations for cube building.
 */

/**
 * Maximum number of high-lift cards to cache per card.
 */
const MAX_LIFT_CARDS = 100;

/**
 * EDHREC card page JSON response type (subset of fields we need)
 */
interface EDHRECCardView {
  name: string;
  sanitized?: string;
  synergy?: number;
  lift?: number;
  inclusion?: number;
}

interface EDHRECCardList {
  tag?: string;
  header?: string;
  cardviews?: EDHRECCardView[];
}

interface EDHRECCardResponse {
  // New structure: cardlists is nested in container.json_dict
  container?: {
    json_dict?: {
      cardlists?: EDHRECCardList[];
    };
  };
  // Old/alternative structure: cardlists at top level
  cardlists?: EDHRECCardList[];
}

/**
 * Lift data for a single related card.
 */
export interface CardLiftEntry {
  name: string;
  lift: number;
  synergy: number;
}

/**
 * Cache for card lift data.
 * Key: card name (lowercase), Value: Array of lift entries
 */
const cardLiftCache = new Map<string, CardLiftEntry[]>();

/**
 * Track in-flight fetch promises to prevent duplicate requests.
 */
const fetchPromises = new Map<string, Promise<CardLiftEntry[]>>();

/**
 * Converts a card name to a URL-safe slug for EDHREC API.
 *
 * @param name - The card name
 * @returns URL-safe slug
 */
function sanitizeCardName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[',]/g, '') // Remove apostrophes and commas
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/[^a-z0-9-]/g, ''); // Remove other special characters
}

/**
 * Fetches lift data for a card from EDHREC.
 *
 * @param cardName - The card name to fetch lift data for
 * @returns Array of lift entries, sorted by lift score descending
 */
async function fetchCardLiftData(cardName: string): Promise<CardLiftEntry[]> {
  const sanitized = sanitizeCardName(cardName);
  const url = `/json/edhrec/pages/cards/${sanitized}.json`;

  console.log(`[CardLiftCache] Fetching: ${url}`);

  try {
    const response = await fetch(url);

    console.log(`[CardLiftCache] Response status for "${cardName}": ${response.status}`);

    if (!response.ok) {
      console.warn(`[CardLiftCache] Failed to fetch lift data for "${cardName}": ${response.status}`);
      return [];
    }

    const data: EDHRECCardResponse = await response.json();

    // Handle both nested (container.json_dict.cardlists) and flat (cardlists) structures
    const cardlists = data.container?.json_dict?.cardlists ?? data.cardlists ?? [];

    console.log(`[CardLiftCache] Response keys for "${cardName}":`, Object.keys(data));
    console.log(`[CardLiftCache] Cardlists found: ${cardlists.length}`);
    if (cardlists.length > 0) {
      for (const cl of cardlists.slice(0, 3)) {
        console.log(`[CardLiftCache] Cardlist: "${cl.header || cl.tag}", cardviews: ${cl.cardviews?.length ?? 0}`);
      }
    }

    // Collect all cards with lift data from all cardlists
    const liftEntries: CardLiftEntry[] = [];
    const seenNames = new Set<string>();

    if (cardlists.length > 0) {
      for (const cardlist of cardlists) {
        if (!cardlist.cardviews) continue;

        for (const card of cardlist.cardviews) {
          // Skip duplicates and cards without lift data
          if (!card.name || card.lift === undefined || seenNames.has(card.name)) {
            continue;
          }

          seenNames.add(card.name);
          liftEntries.push({
            name: card.name,
            lift: card.lift,
            synergy: card.synergy ?? 0,
          });
        }
      }
    }

    // Sort by lift descending and take top MAX_LIFT_CARDS
    liftEntries.sort((a, b) => b.lift - a.lift);
    const topEntries = liftEntries.slice(0, MAX_LIFT_CARDS);

    console.log(`[CardLiftCache] Fetched ${topEntries.length} lift entries for "${cardName}"`);
    if (topEntries.length > 0) {
      console.log(`[CardLiftCache] Top 3:`, topEntries.slice(0, 3).map(e => `${e.name}: ${e.lift.toFixed(1)}`));
    }

    return topEntries;
  } catch (error) {
    console.warn(`[CardLiftCache] Error fetching lift data for "${cardName}":`, error);
    return [];
  }
}

/**
 * Gets cached lift data for a card, fetching if necessary.
 * Uses promise deduplication to prevent concurrent fetches for the same card.
 *
 * @param cardName - The card name
 * @returns Promise resolving to array of lift entries
 */
export async function getCardLiftData(cardName: string): Promise<CardLiftEntry[]> {
  const cacheKey = cardName.toLowerCase();

  // Return cached data if available
  const cached = cardLiftCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // Return existing fetch promise if one is in-flight
  const existingPromise = fetchPromises.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }

  // Start a new fetch
  const fetchPromise = fetchCardLiftData(cardName).then((entries) => {
    cardLiftCache.set(cacheKey, entries);
    fetchPromises.delete(cacheKey);
    return entries;
  }).catch((error) => {
    fetchPromises.delete(cacheKey);
    console.warn(`[CardLiftCache] Fetch failed for "${cardName}":`, error);
    return [];
  });

  fetchPromises.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Preloads lift data for multiple cards in parallel.
 * Useful for preloading when cards are added to the cube.
 *
 * @param cardNames - Array of card names to preload
 */
export async function preloadCardLiftData(cardNames: string[]): Promise<void> {
  const promises = cardNames.map((name) => getCardLiftData(name));
  await Promise.all(promises);
}

/**
 * Checks if lift data is cached for a card.
 *
 * @param cardName - The card name
 * @returns True if cached
 */
export function hasCardLiftData(cardName: string): boolean {
  return cardLiftCache.has(cardName.toLowerCase());
}

/**
 * Gets the current cache size.
 *
 * @returns Number of cards with cached lift data
 */
export function getCardLiftCacheSize(): number {
  return cardLiftCache.size;
}

/**
 * Clears the card lift cache. Useful for testing.
 */
export function clearCardLiftCache(): void {
  cardLiftCache.clear();
  fetchPromises.clear();
}
