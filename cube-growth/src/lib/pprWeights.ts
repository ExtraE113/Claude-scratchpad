/**
 * Personalized PageRank weight calculation for recommendation context.
 *
 * Implements Personalized PageRank (PPR) using power iteration.
 * Cards closer to the selected card and hub cards receive higher weights.
 */

import Graph from 'graphology';
import type { CubeGraph } from '../types';

/**
 * Calculate Personalized PageRank weights for all cards in the graph,
 * starting from the selected card.
 *
 * Uses power iteration with alpha=0.85 damping factor.
 * The personalization vector is concentrated on the selected node.
 *
 * @param cubeGraph - The current cube graph
 * @param selectedId - Oracle ID of the selected card (PPR seed)
 * @returns Map of oracle IDs to integer weights (1-10)
 */
export function calculatePPRWeights(
  cubeGraph: CubeGraph,
  selectedId: string
): Map<string, number> {
  // Handle empty graph or single node
  if (cubeGraph.nodes.size === 0) {
    return new Map([[selectedId, 10]]);
  }

  if (cubeGraph.nodes.size === 1) {
    return new Map([[selectedId, 10]]);
  }

  // Build graphology graph from our CubeGraph
  const g = new Graph({ type: 'undirected' });

  // Add all nodes
  cubeGraph.nodes.forEach((_, id) => {
    g.addNode(id);
  });

  // Add all edges
  cubeGraph.edges.forEach((edgeKey) => {
    const [a, b] = edgeKey.split('|');
    if (g.hasNode(a) && g.hasNode(b) && !g.hasEdge(a, b)) {
      g.addEdge(a, b);
    }
  });

  // Handle case where selected node doesn't exist or has no edges
  if (!g.hasNode(selectedId) || g.degree(selectedId) === 0) {
    const weights = new Map<string, number>();
    cubeGraph.nodes.forEach((_, id) => {
      weights.set(id, id === selectedId ? 10 : 1);
    });
    return weights;
  }

  // Run Personalized PageRank using power iteration
  const scores = personalizedPageRank(g, selectedId, {
    alpha: 0.85,
    maxIterations: 100,
    tolerance: 1e-6,
  });

  // Find max score for normalization (excluding the selected node)
  let maxScore = 0;
  for (const [id, score] of scores.entries()) {
    if (id !== selectedId && score > maxScore) {
      maxScore = score;
    }
  }

  // If maxScore is 0 (all other nodes disconnected), use the selected score
  if (maxScore === 0) {
    maxScore = scores.get(selectedId) ?? 1;
  }

  // Normalize to 1-10 integer range
  const weights = new Map<string, number>();

  for (const [id, score] of scores.entries()) {
    if (id === selectedId) {
      // Selected card always gets max weight
      weights.set(id, 10);
    } else {
      // Normalize other scores to 1-10 range
      const normalized = Math.max(1, Math.ceil((score / maxScore) * 9) + 1);
      weights.set(id, Math.min(10, normalized));
    }
  }

  return weights;
}

/**
 * Personalized PageRank options
 */
interface PPROptions {
  alpha: number;        // Damping factor (probability of following edges)
  maxIterations: number;
  tolerance: number;    // Convergence tolerance
}

/**
 * Compute Personalized PageRank using power iteration.
 *
 * @param graph - The graphology graph
 * @param seedNode - The node to personalize towards
 * @param options - PPR options
 * @returns Map of node IDs to PPR scores
 */
function personalizedPageRank(
  graph: Graph,
  seedNode: string,
  options: PPROptions
): Map<string, number> {
  const { alpha, maxIterations, tolerance } = options;
  const nodes = graph.nodes();
  const n = nodes.length;

  // Initialize scores uniformly
  let scores = new Map<string, number>();
  for (const node of nodes) {
    scores.set(node, 1 / n);
  }

  // Personalization vector: 1 for seed, 0 for others
  const personalization = new Map<string, number>();
  for (const node of nodes) {
    personalization.set(node, node === seedNode ? 1 : 0);
  }

  // Power iteration
  for (let iter = 0; iter < maxIterations; iter++) {
    const newScores = new Map<string, number>();
    let diff = 0;

    for (const node of nodes) {
      // Sum contributions from neighbors
      let sum = 0;
      const neighbors = graph.neighbors(node);

      for (const neighbor of neighbors) {
        const neighborDegree = graph.degree(neighbor);
        if (neighborDegree > 0) {
          sum += (scores.get(neighbor) ?? 0) / neighborDegree;
        }
      }

      // Apply damping and personalization
      const newScore = (1 - alpha) * (personalization.get(node) ?? 0) + alpha * sum;
      newScores.set(node, newScore);

      // Track convergence
      diff += Math.abs(newScore - (scores.get(node) ?? 0));
    }

    scores = newScores;

    // Check convergence
    if (diff < tolerance) {
      break;
    }
  }

  return scores;
}

/**
 * Build an array of card names with repetition based on PPR weights.
 * Higher-weighted cards appear more times in the array.
 *
 * @param cardNames - Array of [oracleId, cardName] tuples
 * @param weights - Map of oracle IDs to weights
 * @param maxEntries - Maximum total entries in the result (default 100)
 * @returns Array of card names with repetition
 */
export function buildWeightedCardNames(
  cardNames: Array<[string, string]>,
  weights: Map<string, number>,
  maxEntries: number = 100
): string[] {
  const result: string[] = [];

  for (const [oracleId, name] of cardNames) {
    const weight = weights.get(oracleId) ?? 1;
    for (let i = 0; i < weight && result.length < maxEntries; i++) {
      result.push(name);
    }
  }

  return result;
}
