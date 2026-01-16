/**
 * EDHREC Recommender client
 *
 * Provides card recommendations using the EDHREC API.
 * Uses Kenrith, the Returned King as a neutral 5-color commander.
 * Baseline scores (Kenrith + 0 cards) are subtracted to filter out
 * generic 5-color goodstuff and highlight context-specific synergies.
 */

import type { Card, Recommendation } from '../types';
import { fetchCardsByNames } from './scryfall';
import { isCommanderOnlyCard } from './commanderFilter';
import { getBaselineCache } from './baselineCache';

/**
 * The commander used for EDHREC requests.
 * Kenrith is a 5-color commander that doesn't restrict color identity.
 */
const DEFAULT_COMMANDER = 'Kenrith, the Returned King';

/**
 * Number of pages to fetch for recommendations.
 * We fetch multiple pages to build a good candidate pool before
 * applying baseline subtraction and re-sorting.
 */
const PAGES_TO_FETCH = 3;

/**
 * Recommendations per page (EDHREC default).
 */
const RECS_PER_PAGE = 100;

/**
 * EDHREC API response type
 */
interface EDHRECResponse {
  inRecs: Array<{
    name: string;
    oracle_id: string;
    primary_type: string;
    score: number;
    salt: number;
  }>;
  outRecs: Array<{
    name: string;
    oracle_id: string;
    primary_type: string;
    score: number;
    salt: number;
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
 * Intermediate recommendation before full card data is fetched.
 */
interface RawRecommendation {
  name: string;
  oracleId: string;
  rawScore: number;
  adjustedScore: number;
}

/**
 * Fetches a single page of recommendations from EDHREC.
 */
async function fetchRecommendationPage(
  cardNames: string[],
  offset: number
): Promise<EDHRECResponse> {
  const requestBody: EDHRECRequest = {
    cards: cardNames,
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
    throw new Error(`EDHREC request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get card recommendations from EDHREC based on a source card and context.
 * Subtracts baseline scores (Kenrith + 0 cards) to filter out generic
 * goodstuff and highlight context-specific synergies.
 *
 * @param sourceCard - The card to get recommendations for
 * @param context - Array of context cards (neighbors in the graph)
 * @returns Array of up to 10 recommendations, filtered for commander-only cards
 */
export async function getRecommendations(
  sourceCard: Card,
  context: Card[]
): Promise<Recommendation[]> {
  // Build unique card names list for EDHREC request
  const cardNames = [sourceCard.name, ...context.map((c) => c.name)];

  // Get the baseline cache for score adjustment
  const baselineCache = await getBaselineCache();
  console.log('[Recommender] Baseline cache size:', baselineCache.size);

  // Fetch multiple pages to build a candidate pool
  const candidates = new Map<string, RawRecommendation>();

  for (let page = 0; page < PAGES_TO_FETCH; page++) {
    const offset = page * RECS_PER_PAGE;

    try {
      const data = await fetchRecommendationPage(cardNames, offset);

      for (const rec of data.inRecs) {
        // Skip if we already have this card (from earlier page)
        if (candidates.has(rec.name)) {
          continue;
        }

        // Skip commander-only cards early
        if (isCommanderOnlyCard(rec.name)) {
          continue;
        }

        // Calculate adjusted score by subtracting baseline
        const baselineScore = baselineCache.get(rec.name) ?? 0;
        const adjustedScore = rec.score - baselineScore;

        candidates.set(rec.name, {
          name: rec.name,
          oracleId: rec.oracle_id,
          rawScore: rec.score,
          adjustedScore,
        });
      }

      // Stop if no more pages
      if (!data.more) {
        break;
      }
    } catch (error) {
      console.warn(`Failed to fetch recommendation page ${page}:`, error);
      break;
    }
  }

  // Sort candidates by adjusted score (descending) and filter out non-synergistic cards
  // Cards with score <= 0 are no more synergistic than generic 5-color goodstuff
  const allCandidates = Array.from(candidates.values());
  console.log('[Recommender] Total candidates:', allCandidates.length);
  console.log('[Recommender] Sample candidates (first 5):', allCandidates.slice(0, 5).map(c => ({
    name: c.name,
    rawScore: c.rawScore,
    adjustedScore: c.adjustedScore,
  })));

  const sortedCandidates = allCandidates
    .filter((c) => c.adjustedScore > 0)
    .sort((a, b) => b.adjustedScore - a.adjustedScore);

  console.log('[Recommender] After filter (score > 0):', sortedCandidates.length);
  console.log('[Recommender] Top 5 after filter:', sortedCandidates.slice(0, 5).map(c => ({
    name: c.name,
    adjustedScore: c.adjustedScore,
  })));

  // Get the set of oracle IDs already in context for marking alreadyInGraph
  const contextOracleIds = new Set([
    sourceCard.oracleId,
    ...context.map((c) => c.oracleId),
  ]);

  // Pre-filter recommendations by name (skip obvious commander-only cards)
  // We'll fetch more than 10 to account for cards that may be filtered out after fetching
  const FETCH_BUFFER = 15; // Fetch extra cards in case some are filtered out
  const MAX_RECOMMENDATIONS = 10;

  const topCandidates = sortedCandidates.slice(0, MAX_RECOMMENDATIONS + FETCH_BUFFER);

  // Batch fetch all candidate cards from Scryfall
  const namesToFetch = topCandidates.map((c) => c.name);
  const { cards: fetchedCards, notFound } = await fetchCardsByNames(namesToFetch);

  // Log any cards that weren't found (for debugging)
  if (notFound.length > 0) {
    console.warn('Cards not found in Scryfall:', notFound);
  }

  // Create a map of card name -> fetched Card for easy lookup
  const cardsByName = new Map<string, Card>();
  for (const card of fetchedCards) {
    cardsByName.set(card.name, card);
  }

  // Build recommendations in the sorted order, filtering out commander-only cards
  const recommendations: Recommendation[] = [];

  for (const candidate of topCandidates) {
    // Stop once we have enough recommendations
    if (recommendations.length >= MAX_RECOMMENDATIONS) {
      break;
    }

    const card = cardsByName.get(candidate.name);
    if (!card) {
      // Card wasn't found in Scryfall
      continue;
    }

    // Check oracle text for commander keywords after fetching
    if (isCommanderOnlyCard(card.name, card.oracleText)) {
      continue;
    }

    recommendations.push({
      card,
      score: candidate.adjustedScore,
      alreadyInGraph: contextOracleIds.has(card.oracleId),
    });
  }

  return recommendations;
}
