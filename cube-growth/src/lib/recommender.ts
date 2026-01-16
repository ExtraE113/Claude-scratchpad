/**
 * EDHREC Recommender client
 *
 * Provides card recommendations using the EDHREC API.
 * Uses Kenrith, the Returned King as a neutral 5-color commander.
 * Cards are weighted using Personalized PageRank for better relevance.
 * Baseline scores (Kenrith + 0 cards) are subtracted to filter out
 * generic 5-color goodstuff and highlight context-specific synergies.
 */

import type { Card, CubeGraph, Recommendation } from '../types';
import { fetchCard } from './scryfall';
import { isCommanderOnlyCard } from './commanderFilter';
import { calculatePPRWeights, buildWeightedCardNames } from './pprWeights';
import { getBaselineCache } from './baselineCache';

/**
 * The commander used for EDHREC requests.
 * Kenrith is a 5-color commander that doesn't restrict color identity.
 */
const DEFAULT_COMMANDER = 'Kenrith, the Returned King';

/**
 * Maximum number of card name entries in the EDHREC request.
 * Higher weights mean more repetitions, so we cap to avoid huge requests.
 */
const MAX_CARD_ENTRIES = 100;

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
 * Uses Personalized PageRank to weight cards by their importance relative
 * to the source card. Subtracts baseline scores (Kenrith + 0 cards) to
 * filter out generic goodstuff and highlight context-specific synergies.
 *
 * @param sourceCard - The card to get recommendations for
 * @param context - Array of context cards (neighbors in the graph)
 * @param graph - The full cube graph (used for PPR calculation)
 * @returns Array of up to 10 recommendations, filtered for commander-only cards
 */
export async function getRecommendations(
  sourceCard: Card,
  context: Card[],
  graph: CubeGraph
): Promise<Recommendation[]> {
  // Calculate PPR weights for all cards relative to the source
  const weights = calculatePPRWeights(graph, sourceCard.oracleId);

  // Build card name tuples for weighted expansion
  const cardNameTuples: Array<[string, string]> = [
    [sourceCard.oracleId, sourceCard.name],
    ...context.map((c): [string, string] => [c.oracleId, c.name]),
  ];

  // Build weighted card names (higher weight = more repetitions)
  const cardNames = buildWeightedCardNames(cardNameTuples, weights, MAX_CARD_ENTRIES);

  // Get the baseline cache for score adjustment
  const baselineCache = await getBaselineCache();

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

  // Sort candidates by adjusted score (descending)
  const sortedCandidates = Array.from(candidates.values()).sort(
    (a, b) => b.adjustedScore - a.adjustedScore
  );

  // Get the set of oracle IDs already in context for marking alreadyInGraph
  const contextOracleIds = new Set([
    sourceCard.oracleId,
    ...context.map((c) => c.oracleId),
  ]);

  // Fetch full card data for top candidates until we have 10
  const recommendations: Recommendation[] = [];

  for (const candidate of sortedCandidates) {
    // Stop once we have 10 recommendations
    if (recommendations.length >= 10) {
      break;
    }

    try {
      // Fetch full card data from Scryfall
      const card = await fetchCard(candidate.name);

      // Check oracle text for commander keywords after fetching
      if (isCommanderOnlyCard(card.name, card.oracleText)) {
        continue;
      }

      recommendations.push({
        card,
        score: candidate.adjustedScore,
        alreadyInGraph: contextOracleIds.has(card.oracleId),
      });
    } catch (error) {
      // Skip cards that fail to fetch from Scryfall
      console.warn(`Failed to fetch card "${candidate.name}":`, error);
    }
  }

  return recommendations;
}
