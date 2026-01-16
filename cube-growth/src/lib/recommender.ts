/**
 * EDHREC Recommender client
 *
 * Provides card recommendations using the EDHREC API.
 * Uses Kenrith, the Returned King as a neutral 5-color commander.
 */

import type { Card, Recommendation } from '../types';
import { fetchCard } from './scryfall';
import { isCommanderOnlyCard } from './commanderFilter';

/**
 * The commander used for EDHREC requests.
 * Kenrith is a 5-color commander that doesn't restrict color identity.
 */
const DEFAULT_COMMANDER = 'Kenrith, the Returned King';

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
 * Get card recommendations from EDHREC based on a source card and context.
 *
 * @param sourceCard - The card to get recommendations for
 * @param context - Array of context cards (neighbors in the graph)
 * @returns Array of up to 10 recommendations, filtered for commander-only cards
 */
export async function getRecommendations(
  sourceCard: Card,
  context: Card[]
): Promise<Recommendation[]> {
  // Build the card names list: source card + context cards
  const cardNames = [sourceCard.name, ...context.map((c) => c.name)];

  // Build the request body
  const requestBody: EDHRECRequest = {
    cards: cardNames,
    commanders: [DEFAULT_COMMANDER],
    name: '',
    options: {
      excludeLands: false,
      offset: 0,
    },
  };

  // Make the request to the proxied EDHREC endpoint
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

  const data: EDHRECResponse = await response.json();

  // Get the set of oracle IDs already in context for marking alreadyInGraph
  const contextOracleIds = new Set([
    sourceCard.oracleId,
    ...context.map((c) => c.oracleId),
  ]);

  // Filter and map recommendations
  const recommendations: Recommendation[] = [];

  for (const rec of data.inRecs) {
    // Skip commander-only cards
    if (isCommanderOnlyCard(rec.name)) {
      continue;
    }

    // Stop once we have 10 recommendations
    if (recommendations.length >= 10) {
      break;
    }

    try {
      // Fetch full card data from Scryfall
      const card = await fetchCard(rec.name);

      // Check oracle text for commander keywords after fetching
      if (isCommanderOnlyCard(card.name, card.oracleText)) {
        continue;
      }

      recommendations.push({
        card,
        score: rec.score,
        alreadyInGraph: contextOracleIds.has(card.oracleId),
      });
    } catch (error) {
      // Skip cards that fail to fetch from Scryfall
      console.warn(`Failed to fetch card "${rec.name}":`, error);
    }
  }

  return recommendations;
}
