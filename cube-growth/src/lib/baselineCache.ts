/**
 * Baseline Cache for EDHREC Recommendations
 *
 * Fetches and caches baseline recommendations for Kenrith with 0 cards.
 * This baseline represents "generic 5-color goodstuff" that we want to
 * subtract from actual recommendations to highlight cards that are
 * specifically synergistic with the user's cube context.
 */

/**
 * The commander used for baseline requests.
 */
const DEFAULT_COMMANDER = 'Kenrith, the Returned King';

/**
 * Maximum number of pages to fetch for baseline.
 */
const MAX_PAGES = 10;

/**
 * Number of recommendations per page (EDHREC default).
 */
const RECS_PER_PAGE = 100;

/**
 * EDHREC API response type (subset of fields we need)
 */
interface EDHRECResponse {
  inRecs: Array<{
    name: string;
    score: number;
  }>;
  more: boolean;
}

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

/**
 * Cache state
 */
let baselineCache: Map<string, number> | null = null;
let fetchPromise: Promise<Map<string, number>> | null = null;
let isFetching = false;

/**
 * Fetches a single page of baseline recommendations.
 *
 * @param offset - The page offset
 * @returns The EDHREC response for that page
 */
async function fetchBaselinePage(offset: number): Promise<EDHRECResponse> {
  const requestBody: EDHRECRequest = {
    cards: [],
    commanders: [DEFAULT_COMMANDER],
    name: '',
    options: {
      excludeLands: false,
      offset,
    },
  };

  const response = await fetch('/api/edhrec/recs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`EDHREC baseline request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetches all baseline pages and builds the cache.
 *
 * @returns Map of card name to baseline score
 */
async function fetchAllBaselinePages(): Promise<Map<string, number>> {
  const cache = new Map<string, number>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * RECS_PER_PAGE;

    try {
      const data = await fetchBaselinePage(offset);

      // Add all recommendations to cache
      for (const rec of data.inRecs) {
        // Store the highest score if we see duplicates
        const existing = cache.get(rec.name);
        if (existing === undefined || rec.score > existing) {
          cache.set(rec.name, rec.score);
        }
      }

      // Stop if no more pages
      if (!data.more) {
        break;
      }
    } catch (error) {
      // Log error but continue with what we have
      console.warn(`Failed to fetch baseline page ${page}:`, error);
      break;
    }
  }

  return cache;
}

/**
 * Gets the baseline cache, fetching it if necessary.
 * Uses a promise cache to prevent multiple concurrent fetches.
 *
 * @returns Promise resolving to the baseline cache Map
 */
export async function getBaselineCache(): Promise<Map<string, number>> {
  // Return cached data if available
  if (baselineCache !== null) {
    return baselineCache;
  }

  // Return existing fetch promise if already fetching
  if (fetchPromise !== null) {
    return fetchPromise;
  }

  // Start fetching
  isFetching = true;
  fetchPromise = fetchAllBaselinePages()
    .then((cache) => {
      baselineCache = cache;
      isFetching = false;
      return cache;
    })
    .catch((error) => {
      // Reset state on error so we can retry
      fetchPromise = null;
      isFetching = false;
      throw error;
    });

  return fetchPromise;
}

/**
 * Gets the baseline score for a specific card.
 *
 * @param cardName - The card name to look up
 * @returns The baseline score, or 0 if not in baseline
 */
export async function getBaselineScore(cardName: string): Promise<number> {
  const cache = await getBaselineCache();
  return cache.get(cardName) ?? 0;
}

/**
 * Checks if the baseline cache is ready (already fetched).
 *
 * @returns True if cache is ready
 */
export function isBaselineCacheReady(): boolean {
  return baselineCache !== null;
}

/**
 * Checks if the baseline cache is currently being fetched.
 *
 * @returns True if currently fetching
 */
export function isBaselineFetching(): boolean {
  return isFetching;
}

/**
 * Clears the baseline cache. Useful for testing.
 */
export function clearBaselineCache(): void {
  baselineCache = null;
  fetchPromise = null;
  isFetching = false;
}

/**
 * Preloads the baseline cache in the background.
 * Call this early in app initialization to minimize wait time.
 */
export function preloadBaselineCache(): void {
  if (baselineCache === null && fetchPromise === null) {
    // Start fetch but don't await it
    getBaselineCache().catch((error) => {
      console.warn('Failed to preload baseline cache:', error);
    });
  }
}
