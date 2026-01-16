/**
 * Lift-based Recommender
 *
 * Generates card recommendations by aggregating weighted lift scores from
 * all cards in the cube. Each card's contribution is weighted by its
 * graph distance from the selected card:
 * - Selected card: weight 10
 * - Direct neighbors: weight 8
 * - 2 edges away: weight 6
 * - 3 edges away: weight 4
 * - 4+ edges away: weight 2
 * - Not connected: weight 1
 *
 * This approach uses EDHREC's per-card synergy data rather than the
 * commander-based recommendation API, providing more relevant results.
 */

import type { Card, CubeGraph, Recommendation, ScoreContribution } from '../types';
import { getCardLiftData, type CardLiftEntry } from './cardLiftCache';
import { fetchCardsByNames } from './scryfall';
import { isCommanderOnlyCard } from './commanderFilter';

/**
 * Maximum number of recommendations to return.
 */
const MAX_RECOMMENDATIONS = 10;

/**
 * Buffer for fetching extra cards to account for filtering.
 */
const FETCH_BUFFER = 15;

/**
 * Weights for different graph distances.
 * Index is the distance, value is the weight.
 */
const DISTANCE_WEIGHTS = [10, 8, 6, 4, 2, 2, 2, 2, 2, 2];

/**
 * Weight for cards that are not connected to the selected card.
 */
const UNCONNECTED_WEIGHT = 1;

/**
 * Minimum aggregated score to include in recommendations.
 */
const MIN_SCORE_THRESHOLD = 5;

/**
 * Intermediate recommendation before full card data is fetched.
 */
interface RawLiftRecommendation {
  name: string;
  aggregatedScore: number;
  contributingCards: number;
  contributions: ScoreContribution[];
}

/**
 * Builds an adjacency list from the graph for efficient traversal.
 */
function buildAdjacencyList(graph: CubeGraph): Map<string, string[]> {
  const adjacencyList = new Map<string, string[]>();

  // Initialize empty arrays for all nodes
  for (const oracleId of graph.nodes.keys()) {
    adjacencyList.set(oracleId, []);
  }

  // Populate from edges
  for (const edge of graph.edges) {
    const [id1, id2] = edge.split('|');
    adjacencyList.get(id1)?.push(id2);
    adjacencyList.get(id2)?.push(id1);
  }

  return adjacencyList;
}

/**
 * Computes graph distances from a source card to all other cards using BFS.
 * Cards not reachable from the source get distance -1.
 *
 * @param graph - The cube graph
 * @param sourceId - Oracle ID of the source card
 * @returns Map from oracle ID to distance (-1 if unreachable)
 */
function computeDistances(graph: CubeGraph, sourceId: string): Map<string, number> {
  const distances = new Map<string, number>();

  // Initialize all distances to -1 (unreachable)
  for (const oracleId of graph.nodes.keys()) {
    distances.set(oracleId, -1);
  }

  // BFS from source
  if (!graph.nodes.has(sourceId)) {
    return distances;
  }

  const adjacencyList = buildAdjacencyList(graph);
  const queue: Array<{ id: string; distance: number }> = [{ id: sourceId, distance: 0 }];
  distances.set(sourceId, 0);

  while (queue.length > 0) {
    const { id, distance } = queue.shift()!;
    const neighbors = adjacencyList.get(id) || [];

    for (const neighbor of neighbors) {
      if (distances.get(neighbor) === -1) {
        distances.set(neighbor, distance + 1);
        queue.push({ id: neighbor, distance: distance + 1 });
      }
    }
  }

  return distances;
}

/**
 * Gets the weight for a given distance.
 *
 * @param distance - Graph distance (-1 for unreachable)
 * @returns Weight value
 */
function getWeightForDistance(distance: number): number {
  if (distance < 0) {
    return UNCONNECTED_WEIGHT;
  }
  if (distance < DISTANCE_WEIGHTS.length) {
    return DISTANCE_WEIGHTS[distance];
  }
  return DISTANCE_WEIGHTS[DISTANCE_WEIGHTS.length - 1];
}

/**
 * Aggregates weighted lift scores from all cards in the cube.
 *
 * @param graph - The cube graph
 * @param sourceId - Oracle ID of the selected card
 * @returns Map of card name to aggregated score
 */
async function aggregateLiftScores(
  graph: CubeGraph,
  sourceId: string
): Promise<Map<string, RawLiftRecommendation>> {
  // Compute distances for weighting
  const distances = computeDistances(graph, sourceId);

  console.log('[LiftRecommender] Computing weights for', graph.nodes.size, 'cards');

  // Get the set of card names already in the cube (to exclude from recommendations)
  const cubeCardNames = new Set<string>();
  for (const card of graph.nodes.values()) {
    cubeCardNames.add(card.name.toLowerCase());
  }

  // Aggregate lift scores from all cards
  const aggregatedScores = new Map<string, RawLiftRecommendation>();

  // Fetch lift data for all cards in parallel
  const fetchPromises: Array<{ card: Card; weight: number; promise: Promise<CardLiftEntry[]> }> = [];

  for (const [oracleId, card] of graph.nodes.entries()) {
    const distance = distances.get(oracleId) ?? -1;
    const weight = getWeightForDistance(distance);

    fetchPromises.push({
      card,
      weight,
      promise: getCardLiftData(card.name),
    });

    console.log(`[LiftRecommender] ${card.name}: distance=${distance}, weight=${weight}`);
  }

  // Wait for all fetches and aggregate
  const results = await Promise.all(fetchPromises.map(async (fp) => ({
    cardName: fp.card.name,
    weight: fp.weight,
    liftData: await fp.promise,
  })));

  for (const { cardName, weight, liftData } of results) {
    for (const entry of liftData) {
      // Skip cards already in the cube
      if (cubeCardNames.has(entry.name.toLowerCase())) {
        continue;
      }

      // Skip commander-only cards by name
      if (isCommanderOnlyCard(entry.name)) {
        continue;
      }

      const weightedLift = entry.lift * weight;
      const contribution: ScoreContribution = {
        cardName,
        lift: entry.lift,
        weight,
        contribution: weightedLift,
      };

      const existing = aggregatedScores.get(entry.name);

      if (existing) {
        existing.aggregatedScore += weightedLift;
        existing.contributingCards++;
        existing.contributions.push(contribution);
      } else {
        aggregatedScores.set(entry.name, {
          name: entry.name,
          aggregatedScore: weightedLift,
          contributingCards: 1,
          contributions: [contribution],
        });
      }
    }
  }

  return aggregatedScores;
}

/**
 * Gets card recommendations based on aggregated lift scores from all cards
 * in the cube, weighted by graph distance from the selected card.
 *
 * @param sourceCard - The selected card
 * @param graph - The cube graph containing all cards
 * @returns Array of up to 10 recommendations
 */
export async function getLiftRecommendations(
  sourceCard: Card,
  graph: CubeGraph
): Promise<Recommendation[]> {
  console.log('[LiftRecommender] Getting recommendations for:', sourceCard.name);

  // Aggregate weighted lift scores
  const aggregatedScores = await aggregateLiftScores(graph, sourceCard.oracleId);

  console.log('[LiftRecommender] Total candidates:', aggregatedScores.size);

  // Sort by aggregated score and filter low scores
  const sortedCandidates = Array.from(aggregatedScores.values())
    .filter((c) => c.aggregatedScore >= MIN_SCORE_THRESHOLD)
    .sort((a, b) => b.aggregatedScore - a.aggregatedScore);

  console.log('[LiftRecommender] After score filter:', sortedCandidates.length);
  console.log('[LiftRecommender] Top 5:', sortedCandidates.slice(0, 5).map((c) => ({
    name: c.name,
    score: c.aggregatedScore.toFixed(1),
    contributors: c.contributingCards,
  })));

  // Take top candidates for fetching
  const topCandidates = sortedCandidates.slice(0, MAX_RECOMMENDATIONS + FETCH_BUFFER);

  if (topCandidates.length === 0) {
    console.log('[LiftRecommender] No candidates found');
    return [];
  }

  // Batch fetch card data from Scryfall
  const namesToFetch = topCandidates.map((c) => c.name);
  const { cards: fetchedCards, notFound } = await fetchCardsByNames(namesToFetch);

  if (notFound.length > 0) {
    console.warn('[LiftRecommender] Cards not found in Scryfall:', notFound);
  }

  // Create lookup map
  const cardsByName = new Map<string, Card>();
  for (const card of fetchedCards) {
    cardsByName.set(card.name, card);
  }

  // Build recommendations
  const recommendations: Recommendation[] = [];

  for (const candidate of topCandidates) {
    if (recommendations.length >= MAX_RECOMMENDATIONS) {
      break;
    }

    const card = cardsByName.get(candidate.name);
    if (!card) {
      continue;
    }

    // Check oracle text for commander keywords
    if (isCommanderOnlyCard(card.name, card.oracleText)) {
      continue;
    }

    // Sort contributions by contribution value descending
    const sortedContributions = candidate.contributions
      .sort((a, b) => b.contribution - a.contribution);

    recommendations.push({
      card,
      score: candidate.aggregatedScore,
      alreadyInGraph: false, // These are filtered out, so never already in graph
      contributions: sortedContributions,
    });
  }

  console.log('[LiftRecommender] Final recommendations:', recommendations.length);

  return recommendations;
}
