/**
 * Graph operations for the MTG Cube Growth Tool.
 * All operations are immutable - they return new graph instances.
 */

import type { Card, CubeGraph } from '../types';
import { makeEdgeKey } from '../types';

/**
 * Creates an empty cube graph.
 *
 * @returns A new empty CubeGraph
 */
export function createGraph(): CubeGraph {
  return {
    nodes: new Map<string, Card>(),
    edges: new Set<string>(),
  };
}

/**
 * Adds a card to the graph as a disconnected node.
 * If the card already exists (by oracleId), returns the graph unchanged.
 *
 * @param graph - The current graph
 * @param card - The card to add
 * @returns A new graph with the card added
 */
export function addCard(graph: CubeGraph, card: Card): CubeGraph {
  if (graph.nodes.has(card.oracleId)) {
    return graph;
  }

  const newNodes = new Map(graph.nodes);
  newNodes.set(card.oracleId, card);

  return {
    nodes: newNodes,
    edges: graph.edges,
  };
}

/**
 * Adds an edge between two existing cards.
 * If either card doesn't exist, or if the edge already exists,
 * or if both IDs are the same, returns the graph unchanged.
 *
 * @param graph - The current graph
 * @param idA - Oracle ID of the first card
 * @param idB - Oracle ID of the second card
 * @returns A new graph with the connection added
 */
export function addConnection(graph: CubeGraph, idA: string, idB: string): CubeGraph {
  // Validate: both cards must exist
  if (!graph.nodes.has(idA) || !graph.nodes.has(idB)) {
    return graph;
  }

  // Validate: cannot connect a card to itself
  if (idA === idB) {
    return graph;
  }

  const edgeKey = makeEdgeKey(idA, idB);

  // If edge already exists, return unchanged
  if (graph.edges.has(edgeKey)) {
    return graph;
  }

  const newEdges = new Set(graph.edges);
  newEdges.add(edgeKey);

  return {
    nodes: graph.nodes,
    edges: newEdges,
  };
}

/**
 * Removes a card and all its edges from the graph.
 * If the card doesn't exist, returns the graph unchanged.
 *
 * @param graph - The current graph
 * @param oracleId - Oracle ID of the card to remove
 * @returns A new graph with the card and its edges removed
 */
export function removeCard(graph: CubeGraph, oracleId: string): CubeGraph {
  if (!graph.nodes.has(oracleId)) {
    return graph;
  }

  // Remove the node
  const newNodes = new Map(graph.nodes);
  newNodes.delete(oracleId);

  // Remove all edges containing this card
  const newEdges = new Set<string>();
  for (const edge of graph.edges) {
    // Edge format is "id1|id2" where id1 < id2 lexicographically
    const [id1, id2] = edge.split('|');
    if (id1 !== oracleId && id2 !== oracleId) {
      newEdges.add(edge);
    }
  }

  return {
    nodes: newNodes,
    edges: newEdges,
  };
}

/**
 * Removes an edge between two cards.
 * If the edge doesn't exist, returns the graph unchanged.
 *
 * @param graph - The current graph
 * @param idA - Oracle ID of the first card
 * @param idB - Oracle ID of the second card
 * @returns A new graph with the connection removed
 */
export function removeConnection(graph: CubeGraph, idA: string, idB: string): CubeGraph {
  const edgeKey = makeEdgeKey(idA, idB);

  if (!graph.edges.has(edgeKey)) {
    return graph;
  }

  const newEdges = new Set(graph.edges);
  newEdges.delete(edgeKey);

  return {
    nodes: graph.nodes,
    edges: newEdges,
  };
}

/**
 * Gets the n nearest neighbors to a card using BFS traversal.
 * Returns up to n cards, ordered by distance from the source card.
 * Does not include the source card itself.
 *
 * @param graph - The current graph
 * @param oracleId - Oracle ID of the source card
 * @param n - Maximum number of neighbors to return
 * @returns Array of cards in BFS order
 */
export function getNeighbors(graph: CubeGraph, oracleId: string, n: number): Card[] {
  if (!graph.nodes.has(oracleId) || n <= 0) {
    return [];
  }

  // Build adjacency list for efficient neighbor lookup
  const adjacencyList = buildAdjacencyList(graph);

  const result: Card[] = [];
  const visited = new Set<string>([oracleId]);
  const queue: string[] = [...(adjacencyList.get(oracleId) || [])];

  // Mark initial neighbors as visited
  for (const neighbor of queue) {
    visited.add(neighbor);
  }

  while (queue.length > 0 && result.length < n) {
    const currentId = queue.shift()!;
    const card = graph.nodes.get(currentId);

    if (card) {
      result.push(card);

      if (result.length < n) {
        // Add unvisited neighbors to the queue
        const neighbors = adjacencyList.get(currentId) || [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
    }
  }

  return result;
}

/**
 * Returns the number of edges connected to a card (its degree).
 * Returns 0 if the card doesn't exist.
 *
 * @param graph - The current graph
 * @param oracleId - Oracle ID of the card
 * @returns The degree of the card
 */
export function getDegree(graph: CubeGraph, oracleId: string): number {
  if (!graph.nodes.has(oracleId)) {
    return 0;
  }

  let degree = 0;
  for (const edge of graph.edges) {
    const [id1, id2] = edge.split('|');
    if (id1 === oracleId || id2 === oracleId) {
      degree++;
    }
  }

  return degree;
}

/**
 * Checks if a card exists in the graph.
 *
 * @param graph - The current graph
 * @param oracleId - Oracle ID of the card to check
 * @returns True if the card exists
 */
export function hasCard(graph: CubeGraph, oracleId: string): boolean {
  return graph.nodes.has(oracleId);
}

/**
 * Checks if an edge exists between two cards.
 *
 * @param graph - The current graph
 * @param idA - Oracle ID of the first card
 * @param idB - Oracle ID of the second card
 * @returns True if the connection exists
 */
export function hasConnection(graph: CubeGraph, idA: string, idB: string): boolean {
  return graph.edges.has(makeEdgeKey(idA, idB));
}

/**
 * Builds an adjacency list from the graph edges for efficient neighbor lookup.
 *
 * @param graph - The current graph
 * @returns Map from oracle ID to array of neighbor oracle IDs
 */
function buildAdjacencyList(graph: CubeGraph): Map<string, string[]> {
  const adjacencyList = new Map<string, string[]>();

  // Initialize empty arrays for all nodes
  for (const oracleId of graph.nodes.keys()) {
    adjacencyList.set(oracleId, []);
  }

  // Populate adjacency list from edges
  for (const edge of graph.edges) {
    const [id1, id2] = edge.split('|');
    adjacencyList.get(id1)?.push(id2);
    adjacencyList.get(id2)?.push(id1);
  }

  return adjacencyList;
}
