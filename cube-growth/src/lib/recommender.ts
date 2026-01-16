/**
 * EDHREC Recommender client
 *
 * Provides card recommendations using the EDHREC API.
 * Uses Kenrith, the Returned King as a neutral 5-color commander.
 */

import type { Card, Recommendation } from '../types';
import { fetchCardsByNames } from './scryfall';
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

  // Pre-filter recommendations by name (skip obvious commander-only cards)
  // We'll fetch more than 10 to account for cards that may be filtered out after fetching
  const FETCH_BUFFER = 15; // Fetch extra cards in case some are filtered out
  const MAX_RECOMMENDATIONS = 10;

  const candidateRecs = data.inRecs.filter((rec) => !isCommanderOnlyCard(rec.name));
  const recsToFetch = candidateRecs.slice(0, MAX_RECOMMENDATIONS + FETCH_BUFFER);

  // Batch fetch all candidate cards from Scryfall
  const namesToFetch = recsToFetch.map((rec) => rec.name);
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

  // Build recommendations in the original order, filtering out commander-only cards
  const recommendations: Recommendation[] = [];

  for (const rec of recsToFetch) {
    // Stop once we have enough recommendations
    if (recommendations.length >= MAX_RECOMMENDATIONS) {
      break;
    }

    const card = cardsByName.get(rec.name);
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
      score: rec.score,
      alreadyInGraph: contextOracleIds.has(card.oracleId),
    });
  }

  return recommendations;
}
