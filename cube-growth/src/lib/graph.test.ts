/**
 * Comprehensive unit tests for the graph operations module.
 */

import { describe, it, expect } from 'vitest';
import {
  createGraph,
  addCard,
  addConnection,
  removeCard,
  removeConnection,
  getNeighbors,
  getDegree,
  hasCard,
  hasConnection,
} from './graph';
import { makeEdgeKey, type Card, type CubeGraph } from '../types';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates a mock Card object with the given oracle ID.
 * All other fields are filled with reasonable defaults based on the ID.
 */
function createMockCard(oracleId: string, overrides: Partial<Card> = {}): Card {
  return {
    oracleId,
    name: overrides.name ?? `Card ${oracleId}`,
    imageUri: overrides.imageUri ?? `https://example.com/images/${oracleId}.jpg`,
    artCropUri: overrides.artCropUri ?? `https://example.com/art/${oracleId}.jpg`,
    manaCost: overrides.manaCost ?? '{2}{B}',
    cmc: overrides.cmc ?? 3,
    colors: overrides.colors ?? ['B'],
    colorIdentity: overrides.colorIdentity ?? ['B'],
    typeLine: overrides.typeLine ?? 'Creature - Zombie',
    oracleText: overrides.oracleText ?? 'Some oracle text',
    power: overrides.power,
    toughness: overrides.toughness,
    loyalty: overrides.loyalty,
  };
}

/**
 * Creates a graph with the specified number of cards.
 * Cards are named "card-1", "card-2", etc.
 */
function createGraphWithCards(count: number): { graph: CubeGraph; cards: Card[] } {
  const cards: Card[] = [];
  let graph = createGraph();

  for (let i = 1; i <= count; i++) {
    const card = createMockCard(`card-${i}`, { name: `Test Card ${i}` });
    cards.push(card);
    graph = addCard(graph, card);
  }

  return { graph, cards };
}

/**
 * Creates a linear chain graph: card-1 -- card-2 -- card-3 -- ...
 */
function createLinearGraph(count: number): { graph: CubeGraph; cards: Card[] } {
  const { graph: initialGraph, cards } = createGraphWithCards(count);
  let graph = initialGraph;

  for (let i = 0; i < count - 1; i++) {
    graph = addConnection(graph, cards[i].oracleId, cards[i + 1].oracleId);
  }

  return { graph, cards };
}

/**
 * Creates a star graph: center connected to all other nodes.
 */
function createStarGraph(spokeCount: number): { graph: CubeGraph; center: Card; spokes: Card[] } {
  const center = createMockCard('center', { name: 'Center Card' });
  let graph = addCard(createGraph(), center);
  const spokes: Card[] = [];

  for (let i = 1; i <= spokeCount; i++) {
    const spoke = createMockCard(`spoke-${i}`, { name: `Spoke Card ${i}` });
    spokes.push(spoke);
    graph = addCard(graph, spoke);
    graph = addConnection(graph, center.oracleId, spoke.oracleId);
  }

  return { graph, center, spokes };
}

// ============================================================================
// Tests: createGraph()
// ============================================================================

describe('createGraph()', () => {
  it('returns empty graph with no nodes', () => {
    const graph = createGraph();
    expect(graph.nodes.size).toBe(0);
  });

  it('returns empty graph with no edges', () => {
    const graph = createGraph();
    expect(graph.edges.size).toBe(0);
  });

  it('returns a new graph object each time', () => {
    const graph1 = createGraph();
    const graph2 = createGraph();
    expect(graph1).not.toBe(graph2);
    expect(graph1.nodes).not.toBe(graph2.nodes);
    expect(graph1.edges).not.toBe(graph2.edges);
  });
});

// ============================================================================
// Tests: addCard()
// ============================================================================

describe('addCard()', () => {
  it('adds a card to empty graph', () => {
    const graph = createGraph();
    const card = createMockCard('test-id');
    const newGraph = addCard(graph, card);

    expect(newGraph.nodes.size).toBe(1);
    expect(newGraph.nodes.get('test-id')).toBe(card);
  });

  it('adds multiple cards', () => {
    let graph = createGraph();
    const card1 = createMockCard('id-1');
    const card2 = createMockCard('id-2');
    const card3 = createMockCard('id-3');

    graph = addCard(graph, card1);
    graph = addCard(graph, card2);
    graph = addCard(graph, card3);

    expect(graph.nodes.size).toBe(3);
    expect(graph.nodes.get('id-1')).toBe(card1);
    expect(graph.nodes.get('id-2')).toBe(card2);
    expect(graph.nodes.get('id-3')).toBe(card3);
  });

  it('is idempotent - adding same card twice does not duplicate', () => {
    const graph = createGraph();
    const card = createMockCard('test-id');

    const graphWith1 = addCard(graph, card);
    const graphWith2 = addCard(graphWith1, card);

    expect(graphWith2.nodes.size).toBe(1);
    // When card already exists, returns same graph reference
    expect(graphWith2).toBe(graphWith1);
  });

  it('is idempotent - adding card with same oracleId but different data does not update', () => {
    const graph = createGraph();
    const card1 = createMockCard('test-id', { name: 'Original Name' });
    const card2 = createMockCard('test-id', { name: 'New Name' });

    const graphWith1 = addCard(graph, card1);
    const graphWith2 = addCard(graphWith1, card2);

    expect(graphWith2.nodes.size).toBe(1);
    expect(graphWith2.nodes.get('test-id')?.name).toBe('Original Name');
  });

  it('returns new graph object (immutability)', () => {
    const originalGraph = createGraph();
    const card = createMockCard('test-id');
    const newGraph = addCard(originalGraph, card);

    expect(newGraph).not.toBe(originalGraph);
    expect(newGraph.nodes).not.toBe(originalGraph.nodes);
    // Original graph is unchanged
    expect(originalGraph.nodes.size).toBe(0);
  });

  it('preserves existing edges when adding a card', () => {
    let graph = createGraph();
    const card1 = createMockCard('id-1');
    const card2 = createMockCard('id-2');

    graph = addCard(graph, card1);
    graph = addCard(graph, card2);
    graph = addConnection(graph, 'id-1', 'id-2');

    const card3 = createMockCard('id-3');
    const newGraph = addCard(graph, card3);

    expect(newGraph.edges.size).toBe(1);
    expect(newGraph.edges).toBe(graph.edges); // Edges are preserved by reference
  });
});

// ============================================================================
// Tests: addConnection()
// ============================================================================

describe('addConnection()', () => {
  it('creates edge between two existing cards', () => {
    const { graph, cards } = createGraphWithCards(2);
    const newGraph = addConnection(graph, cards[0].oracleId, cards[1].oracleId);

    expect(newGraph.edges.size).toBe(1);
    expect(hasConnection(newGraph, cards[0].oracleId, cards[1].oracleId)).toBe(true);
  });

  it('fails gracefully if first card does not exist', () => {
    const { graph, cards } = createGraphWithCards(1);
    const newGraph = addConnection(graph, 'non-existent', cards[0].oracleId);

    expect(newGraph.edges.size).toBe(0);
    expect(newGraph).toBe(graph); // Returns same graph
  });

  it('fails gracefully if second card does not exist', () => {
    const { graph, cards } = createGraphWithCards(1);
    const newGraph = addConnection(graph, cards[0].oracleId, 'non-existent');

    expect(newGraph.edges.size).toBe(0);
    expect(newGraph).toBe(graph); // Returns same graph
  });

  it('fails gracefully if both cards do not exist', () => {
    const graph = createGraph();
    const newGraph = addConnection(graph, 'fake-1', 'fake-2');

    expect(newGraph.edges.size).toBe(0);
    expect(newGraph).toBe(graph);
  });

  it('fails gracefully if cards are the same (self-loop)', () => {
    const { graph, cards } = createGraphWithCards(1);
    const newGraph = addConnection(graph, cards[0].oracleId, cards[0].oracleId);

    expect(newGraph.edges.size).toBe(0);
    expect(newGraph).toBe(graph);
  });

  it('is idempotent - adding same connection twice does not duplicate', () => {
    const { graph, cards } = createGraphWithCards(2);

    const graphWith1 = addConnection(graph, cards[0].oracleId, cards[1].oracleId);
    const graphWith2 = addConnection(graphWith1, cards[0].oracleId, cards[1].oracleId);

    expect(graphWith2.edges.size).toBe(1);
    expect(graphWith2).toBe(graphWith1); // Same reference when already exists
  });

  it('edge key is consistent regardless of argument order', () => {
    const { graph, cards } = createGraphWithCards(2);

    // Add connection in one order
    const graphWith1 = addConnection(graph, cards[0].oracleId, cards[1].oracleId);
    expect(graphWith1.edges.size).toBe(1);

    // Try adding in reverse order - should be idempotent
    const graphWith2 = addConnection(graphWith1, cards[1].oracleId, cards[0].oracleId);
    expect(graphWith2.edges.size).toBe(1);
    expect(graphWith2).toBe(graphWith1);
  });

  it('returns new graph object (immutability)', () => {
    const { graph, cards } = createGraphWithCards(2);
    const newGraph = addConnection(graph, cards[0].oracleId, cards[1].oracleId);

    expect(newGraph).not.toBe(graph);
    expect(newGraph.edges).not.toBe(graph.edges);
    expect(graph.edges.size).toBe(0); // Original unchanged
  });

  it('preserves existing nodes when adding connection', () => {
    const { graph, cards } = createGraphWithCards(3);
    const newGraph = addConnection(graph, cards[0].oracleId, cards[1].oracleId);

    expect(newGraph.nodes.size).toBe(3);
    expect(newGraph.nodes).toBe(graph.nodes); // Nodes preserved by reference
  });

  it('can create multiple connections from same node', () => {
    const { graph, cards } = createGraphWithCards(4);

    let newGraph = addConnection(graph, cards[0].oracleId, cards[1].oracleId);
    newGraph = addConnection(newGraph, cards[0].oracleId, cards[2].oracleId);
    newGraph = addConnection(newGraph, cards[0].oracleId, cards[3].oracleId);

    expect(newGraph.edges.size).toBe(3);
    expect(getDegree(newGraph, cards[0].oracleId)).toBe(3);
  });
});

// ============================================================================
// Tests: removeCard()
// ============================================================================

describe('removeCard()', () => {
  it('removes card from graph', () => {
    const { graph, cards } = createGraphWithCards(3);
    const newGraph = removeCard(graph, cards[1].oracleId);

    expect(newGraph.nodes.size).toBe(2);
    expect(hasCard(newGraph, cards[0].oracleId)).toBe(true);
    expect(hasCard(newGraph, cards[1].oracleId)).toBe(false);
    expect(hasCard(newGraph, cards[2].oracleId)).toBe(true);
  });

  it('removes all edges connected to that card', () => {
    const { graph, center } = createStarGraph(3);
    expect(graph.edges.size).toBe(3);

    const newGraph = removeCard(graph, center.oracleId);

    expect(newGraph.edges.size).toBe(0);
    expect(newGraph.nodes.size).toBe(3); // Only spokes remain
  });

  it('removes edges from both directions', () => {
    const { graph, cards } = createLinearGraph(3);
    // Graph: card-1 -- card-2 -- card-3

    const newGraph = removeCard(graph, cards[1].oracleId);

    // Both edges connected to card-2 should be removed
    expect(newGraph.edges.size).toBe(0);
    expect(hasCard(newGraph, cards[0].oracleId)).toBe(true);
    expect(hasCard(newGraph, cards[2].oracleId)).toBe(true);
  });

  it('handles removing non-existent card gracefully', () => {
    const { graph } = createGraphWithCards(2);
    const newGraph = removeCard(graph, 'non-existent');

    expect(newGraph).toBe(graph); // Returns same reference
    expect(newGraph.nodes.size).toBe(2);
  });

  it('returns new graph object (immutability)', () => {
    const { graph, cards } = createGraphWithCards(2);
    const newGraph = removeCard(graph, cards[0].oracleId);

    expect(newGraph).not.toBe(graph);
    expect(newGraph.nodes).not.toBe(graph.nodes);
    expect(graph.nodes.size).toBe(2); // Original unchanged
  });

  it('handles removing from empty graph gracefully', () => {
    const graph = createGraph();
    const newGraph = removeCard(graph, 'any-id');

    expect(newGraph).toBe(graph);
  });

  it('preserves unrelated edges when removing card', () => {
    const { graph: initial, cards } = createGraphWithCards(4);
    // Create: card-1 -- card-2, card-3 -- card-4
    let graph = addConnection(initial, cards[0].oracleId, cards[1].oracleId);
    graph = addConnection(graph, cards[2].oracleId, cards[3].oracleId);

    // Remove card-1, should only remove edge card-1 -- card-2
    const newGraph = removeCard(graph, cards[0].oracleId);

    expect(newGraph.edges.size).toBe(1);
    expect(hasConnection(newGraph, cards[2].oracleId, cards[3].oracleId)).toBe(true);
  });
});

// ============================================================================
// Tests: removeConnection()
// ============================================================================

describe('removeConnection()', () => {
  it('removes edge between cards', () => {
    const { graph, cards } = createLinearGraph(2);
    expect(graph.edges.size).toBe(1);

    const newGraph = removeConnection(graph, cards[0].oracleId, cards[1].oracleId);

    expect(newGraph.edges.size).toBe(0);
  });

  it('handles removing non-existent edge gracefully', () => {
    const { graph, cards } = createGraphWithCards(2);
    // No connection between cards
    const newGraph = removeConnection(graph, cards[0].oracleId, cards[1].oracleId);

    expect(newGraph).toBe(graph); // Returns same reference
  });

  it('leaves both cards in graph after removing connection', () => {
    const { graph, cards } = createLinearGraph(2);
    const newGraph = removeConnection(graph, cards[0].oracleId, cards[1].oracleId);

    expect(hasCard(newGraph, cards[0].oracleId)).toBe(true);
    expect(hasCard(newGraph, cards[1].oracleId)).toBe(true);
    expect(newGraph.nodes.size).toBe(2);
  });

  it('returns new graph object (immutability)', () => {
    const { graph, cards } = createLinearGraph(2);
    const newGraph = removeConnection(graph, cards[0].oracleId, cards[1].oracleId);

    expect(newGraph).not.toBe(graph);
    expect(newGraph.edges).not.toBe(graph.edges);
    expect(graph.edges.size).toBe(1); // Original unchanged
  });

  it('works regardless of argument order', () => {
    const { graph, cards } = createLinearGraph(2);

    // Remove with reversed order
    const newGraph = removeConnection(graph, cards[1].oracleId, cards[0].oracleId);

    expect(newGraph.edges.size).toBe(0);
  });

  it('preserves other edges when removing one', () => {
    const { graph: initial, cards } = createGraphWithCards(3);
    // Create: card-1 -- card-2 -- card-3
    let graph = addConnection(initial, cards[0].oracleId, cards[1].oracleId);
    graph = addConnection(graph, cards[1].oracleId, cards[2].oracleId);
    expect(graph.edges.size).toBe(2);

    const newGraph = removeConnection(graph, cards[0].oracleId, cards[1].oracleId);

    expect(newGraph.edges.size).toBe(1);
    expect(hasConnection(newGraph, cards[1].oracleId, cards[2].oracleId)).toBe(true);
  });

  it('handles removing edge with non-existent cards', () => {
    const { graph } = createGraphWithCards(2);
    const newGraph = removeConnection(graph, 'fake-1', 'fake-2');

    expect(newGraph).toBe(graph);
  });
});

// ============================================================================
// Tests: getNeighbors()
// ============================================================================

describe('getNeighbors()', () => {
  it('returns empty array for card with no neighbors', () => {
    const { graph, cards } = createGraphWithCards(3);
    // Cards exist but no edges

    const neighbors = getNeighbors(graph, cards[0].oracleId, 10);

    expect(neighbors).toEqual([]);
  });

  it('returns empty array for non-existent card', () => {
    const { graph } = createGraphWithCards(3);
    const neighbors = getNeighbors(graph, 'non-existent', 10);

    expect(neighbors).toEqual([]);
  });

  it('returns empty array when n is 0', () => {
    const { graph, center } = createStarGraph(3);
    const neighbors = getNeighbors(graph, center.oracleId, 0);

    expect(neighbors).toEqual([]);
  });

  it('returns empty array when n is negative', () => {
    const { graph, center } = createStarGraph(3);
    const neighbors = getNeighbors(graph, center.oracleId, -1);

    expect(neighbors).toEqual([]);
  });

  it('returns direct neighbors first', () => {
    const { graph, center, spokes } = createStarGraph(3);
    const neighbors = getNeighbors(graph, center.oracleId, 10);

    expect(neighbors.length).toBe(3);
    // All returned cards should be from spokes
    const neighborIds = neighbors.map(c => c.oracleId);
    for (const spoke of spokes) {
      expect(neighborIds).toContain(spoke.oracleId);
    }
  });

  it('BFS order is correct (level by level)', () => {
    // Create a graph where BFS order matters:
    //     A
    //    / \
    //   B   C
    //   |
    //   D
    //   |
    //   E
    const cardA = createMockCard('A');
    const cardB = createMockCard('B');
    const cardC = createMockCard('C');
    const cardD = createMockCard('D');
    const cardE = createMockCard('E');

    let graph = createGraph();
    graph = addCard(graph, cardA);
    graph = addCard(graph, cardB);
    graph = addCard(graph, cardC);
    graph = addCard(graph, cardD);
    graph = addCard(graph, cardE);

    graph = addConnection(graph, 'A', 'B');
    graph = addConnection(graph, 'A', 'C');
    graph = addConnection(graph, 'B', 'D');
    graph = addConnection(graph, 'D', 'E');

    const neighbors = getNeighbors(graph, 'A', 10);
    const neighborIds = neighbors.map(c => c.oracleId);

    expect(neighborIds.length).toBe(4);

    // B and C should come before D (they are level 1, D is level 2)
    const indexB = neighborIds.indexOf('B');
    const indexC = neighborIds.indexOf('C');
    const indexD = neighborIds.indexOf('D');
    const indexE = neighborIds.indexOf('E');

    expect(indexB).toBeLessThan(indexD);
    expect(indexC).toBeLessThan(indexD);
    expect(indexD).toBeLessThan(indexE);
  });

  it('respects limit parameter', () => {
    const { graph, center } = createStarGraph(5);
    const neighbors = getNeighbors(graph, center.oracleId, 2);

    expect(neighbors.length).toBe(2);
  });

  it('handles requesting more neighbors than exist', () => {
    const { graph, center, spokes } = createStarGraph(3);
    const neighbors = getNeighbors(graph, center.oracleId, 100);

    expect(neighbors.length).toBe(3); // Only 3 spokes exist
    const neighborIds = neighbors.map(c => c.oracleId);
    for (const spoke of spokes) {
      expect(neighborIds).toContain(spoke.oracleId);
    }
  });

  it('does not include the source card', () => {
    const { graph, center } = createStarGraph(3);
    const neighbors = getNeighbors(graph, center.oracleId, 10);

    const neighborIds = neighbors.map(c => c.oracleId);
    expect(neighborIds).not.toContain(center.oracleId);
  });

  it('does not visit same node twice in cyclic graph', () => {
    // Create a triangle: A -- B -- C -- A
    const cardA = createMockCard('A');
    const cardB = createMockCard('B');
    const cardC = createMockCard('C');

    let graph = createGraph();
    graph = addCard(graph, cardA);
    graph = addCard(graph, cardB);
    graph = addCard(graph, cardC);
    graph = addConnection(graph, 'A', 'B');
    graph = addConnection(graph, 'B', 'C');
    graph = addConnection(graph, 'C', 'A');

    const neighbors = getNeighbors(graph, 'A', 10);
    expect(neighbors.length).toBe(2); // Only B and C, not A again

    const neighborIds = neighbors.map(c => c.oracleId);
    expect(neighborIds).toContain('B');
    expect(neighborIds).toContain('C');
    expect(neighborIds).not.toContain('A');
  });

  it('returns correct order for linear chain', () => {
    // Linear chain: 1 -- 2 -- 3 -- 4 -- 5
    const { graph, cards } = createLinearGraph(5);

    const neighbors = getNeighbors(graph, cards[0].oracleId, 10);
    const neighborIds = neighbors.map(c => c.oracleId);

    // Should return in BFS order: 2, 3, 4, 5
    expect(neighborIds).toEqual([
      cards[1].oracleId,
      cards[2].oracleId,
      cards[3].oracleId,
      cards[4].oracleId,
    ]);
  });

  it('returns neighbors from the middle of chain', () => {
    // Linear chain: 1 -- 2 -- 3 -- 4 -- 5
    const { graph, cards } = createLinearGraph(5);

    const neighbors = getNeighbors(graph, cards[2].oracleId, 10);
    const neighborIds = neighbors.map(c => c.oracleId);

    expect(neighborIds.length).toBe(4);

    // Cards 2 and 4 are direct neighbors (level 1)
    // Cards 1 and 5 are level 2
    const index2 = neighborIds.indexOf(cards[1].oracleId);
    const index4 = neighborIds.indexOf(cards[3].oracleId);
    const index1 = neighborIds.indexOf(cards[0].oracleId);
    const index5 = neighborIds.indexOf(cards[4].oracleId);

    // Level 1 should come before level 2
    expect(index2).toBeLessThan(index1);
    expect(index2).toBeLessThan(index5);
    expect(index4).toBeLessThan(index1);
    expect(index4).toBeLessThan(index5);
  });
});

// ============================================================================
// Tests: getDegree()
// ============================================================================

describe('getDegree()', () => {
  it('returns 0 for card with no edges', () => {
    const { graph, cards } = createGraphWithCards(3);
    // No connections

    expect(getDegree(graph, cards[0].oracleId)).toBe(0);
    expect(getDegree(graph, cards[1].oracleId)).toBe(0);
  });

  it('returns correct count for card with multiple edges', () => {
    const { graph, center, spokes } = createStarGraph(5);

    expect(getDegree(graph, center.oracleId)).toBe(5);
    // Each spoke has degree 1
    for (const spoke of spokes) {
      expect(getDegree(graph, spoke.oracleId)).toBe(1);
    }
  });

  it('returns 0 for non-existent card', () => {
    const { graph } = createGraphWithCards(3);
    expect(getDegree(graph, 'non-existent')).toBe(0);
  });

  it('returns 0 for empty graph', () => {
    const graph = createGraph();
    expect(getDegree(graph, 'any-id')).toBe(0);
  });

  it('returns correct degree for card in linear chain', () => {
    // 1 -- 2 -- 3 -- 4 -- 5
    const { graph, cards } = createLinearGraph(5);

    // End cards have degree 1
    expect(getDegree(graph, cards[0].oracleId)).toBe(1);
    expect(getDegree(graph, cards[4].oracleId)).toBe(1);

    // Middle cards have degree 2
    expect(getDegree(graph, cards[1].oracleId)).toBe(2);
    expect(getDegree(graph, cards[2].oracleId)).toBe(2);
    expect(getDegree(graph, cards[3].oracleId)).toBe(2);
  });

  it('correctly handles card that had edges removed', () => {
    const { graph: initialGraph, cards } = createLinearGraph(3);
    let graph = initialGraph;
    // 1 -- 2 -- 3
    expect(getDegree(graph, cards[1].oracleId)).toBe(2);

    // Remove one connection
    graph = removeConnection(graph, cards[0].oracleId, cards[1].oracleId);
    expect(getDegree(graph, cards[1].oracleId)).toBe(1);

    // Remove other connection
    graph = removeConnection(graph, cards[1].oracleId, cards[2].oracleId);
    expect(getDegree(graph, cards[1].oracleId)).toBe(0);
  });
});

// ============================================================================
// Tests: hasCard()
// ============================================================================

describe('hasCard()', () => {
  it('returns true for existing card', () => {
    const { graph, cards } = createGraphWithCards(3);

    expect(hasCard(graph, cards[0].oracleId)).toBe(true);
    expect(hasCard(graph, cards[1].oracleId)).toBe(true);
    expect(hasCard(graph, cards[2].oracleId)).toBe(true);
  });

  it('returns false for non-existent card', () => {
    const { graph } = createGraphWithCards(3);

    expect(hasCard(graph, 'non-existent')).toBe(false);
    expect(hasCard(graph, '')).toBe(false);
    expect(hasCard(graph, 'card-999')).toBe(false);
  });

  it('returns false for empty graph', () => {
    const graph = createGraph();
    expect(hasCard(graph, 'any-id')).toBe(false);
  });

  it('returns false after card is removed', () => {
    const { graph: initialGraph, cards } = createGraphWithCards(2);
    let graph = initialGraph;
    expect(hasCard(graph, cards[0].oracleId)).toBe(true);

    graph = removeCard(graph, cards[0].oracleId);
    expect(hasCard(graph, cards[0].oracleId)).toBe(false);
  });
});

// ============================================================================
// Tests: hasConnection()
// ============================================================================

describe('hasConnection()', () => {
  it('returns true for existing connection', () => {
    const { graph, cards } = createLinearGraph(3);

    expect(hasConnection(graph, cards[0].oracleId, cards[1].oracleId)).toBe(true);
    expect(hasConnection(graph, cards[1].oracleId, cards[2].oracleId)).toBe(true);
  });

  it('returns false for non-existent connection', () => {
    const { graph, cards } = createGraphWithCards(3);
    // No connections added

    expect(hasConnection(graph, cards[0].oracleId, cards[1].oracleId)).toBe(false);
    expect(hasConnection(graph, cards[1].oracleId, cards[2].oracleId)).toBe(false);
  });

  it('returns false when cards exist but no edge between them', () => {
    const { graph, cards } = createLinearGraph(3);
    // 1 -- 2 -- 3 (no direct connection between 1 and 3)

    expect(hasConnection(graph, cards[0].oracleId, cards[2].oracleId)).toBe(false);
  });

  it('works regardless of argument order', () => {
    const { graph, cards } = createLinearGraph(2);

    // Both orderings should return true
    expect(hasConnection(graph, cards[0].oracleId, cards[1].oracleId)).toBe(true);
    expect(hasConnection(graph, cards[1].oracleId, cards[0].oracleId)).toBe(true);
  });

  it('returns false for empty graph', () => {
    const graph = createGraph();
    expect(hasConnection(graph, 'a', 'b')).toBe(false);
  });

  it('returns false after connection is removed', () => {
    const { graph: initialGraph, cards } = createLinearGraph(2);
    let graph = initialGraph;
    expect(hasConnection(graph, cards[0].oracleId, cards[1].oracleId)).toBe(true);

    graph = removeConnection(graph, cards[0].oracleId, cards[1].oracleId);
    expect(hasConnection(graph, cards[0].oracleId, cards[1].oracleId)).toBe(false);
  });

  it('returns false when one card does not exist', () => {
    const { graph, cards } = createGraphWithCards(1);
    expect(hasConnection(graph, cards[0].oracleId, 'non-existent')).toBe(false);
    expect(hasConnection(graph, 'non-existent', cards[0].oracleId)).toBe(false);
  });

  it('returns false for self-connection check', () => {
    const { graph, cards } = createGraphWithCards(1);
    // Self-loops are not allowed, so this should be false
    expect(hasConnection(graph, cards[0].oracleId, cards[0].oracleId)).toBe(false);
  });
});

// ============================================================================
// Tests: makeEdgeKey()
// ============================================================================

describe('makeEdgeKey()', () => {
  it('creates consistent key regardless of argument order', () => {
    const key1 = makeEdgeKey('a', 'b');
    const key2 = makeEdgeKey('b', 'a');

    expect(key1).toBe(key2);
  });

  it('creates consistent key with various ID formats', () => {
    // UUIDs
    const uuid1 = '550e8400-e29b-41d4-a716-446655440000';
    const uuid2 = '6fa459ea-ee8a-3ca4-894e-db77e160355e';

    expect(makeEdgeKey(uuid1, uuid2)).toBe(makeEdgeKey(uuid2, uuid1));

    // Mixed alphanumeric
    expect(makeEdgeKey('card-123', 'card-456')).toBe(makeEdgeKey('card-456', 'card-123'));
  });

  it('keys are unique for different pairs', () => {
    const keyAB = makeEdgeKey('a', 'b');
    const keyAC = makeEdgeKey('a', 'c');
    const keyBC = makeEdgeKey('b', 'c');

    expect(keyAB).not.toBe(keyAC);
    expect(keyAB).not.toBe(keyBC);
    expect(keyAC).not.toBe(keyBC);
  });

  it('produces expected format (smaller ID first)', () => {
    // 'a' < 'b' lexicographically
    expect(makeEdgeKey('a', 'b')).toBe('a|b');
    expect(makeEdgeKey('b', 'a')).toBe('a|b');

    // 'apple' < 'banana'
    expect(makeEdgeKey('apple', 'banana')).toBe('apple|banana');
    expect(makeEdgeKey('banana', 'apple')).toBe('apple|banana');
  });

  it('handles identical IDs (though this should not happen in practice)', () => {
    const key = makeEdgeKey('same', 'same');
    expect(key).toBe('same|same');
  });

  it('handles empty strings', () => {
    const key = makeEdgeKey('', 'a');
    expect(key).toBe('|a'); // Empty string comes first

    const key2 = makeEdgeKey('a', '');
    expect(key2).toBe('|a');
  });

  it('handles special characters in IDs', () => {
    const key1 = makeEdgeKey('card-with-dash', 'card_with_underscore');
    const key2 = makeEdgeKey('card_with_underscore', 'card-with-dash');

    expect(key1).toBe(key2);
    expect(key1).toContain('|');
  });
});

// ============================================================================
// Integration Tests: Complex Scenarios
// ============================================================================

describe('Complex Graph Operations', () => {
  it('handles building and modifying a complex graph', () => {
    // Build a more complex graph structure
    let graph = createGraph();

    // Add several cards
    const cards = Array.from({ length: 6 }, (_, i) =>
      createMockCard(`card-${i + 1}`, { name: `Card ${i + 1}` })
    );

    for (const card of cards) {
      graph = addCard(graph, card);
    }

    // Create a web of connections
    // 1 -- 2 -- 3
    //  \  / \  /
    //   4    5
    //    \  /
    //     6
    graph = addConnection(graph, 'card-1', 'card-2');
    graph = addConnection(graph, 'card-2', 'card-3');
    graph = addConnection(graph, 'card-1', 'card-4');
    graph = addConnection(graph, 'card-2', 'card-4');
    graph = addConnection(graph, 'card-2', 'card-5');
    graph = addConnection(graph, 'card-3', 'card-5');
    graph = addConnection(graph, 'card-4', 'card-6');
    graph = addConnection(graph, 'card-5', 'card-6');

    expect(graph.nodes.size).toBe(6);
    expect(graph.edges.size).toBe(8);

    // Verify degrees
    expect(getDegree(graph, 'card-1')).toBe(2); // connected to 2, 4
    expect(getDegree(graph, 'card-2')).toBe(4); // connected to 1, 3, 4, 5
    expect(getDegree(graph, 'card-6')).toBe(2); // connected to 4, 5

    // Get neighbors of central node
    const neighbors = getNeighbors(graph, 'card-2', 10);
    expect(neighbors.length).toBe(5); // All cards except card-2

    // Remove a card and verify cleanup
    graph = removeCard(graph, 'card-2');
    expect(graph.nodes.size).toBe(5);
    expect(graph.edges.size).toBe(4); // Lost 4 edges connected to card-2

    // Remaining connections
    expect(hasConnection(graph, 'card-4', 'card-6')).toBe(true);
    expect(hasConnection(graph, 'card-5', 'card-6')).toBe(true);
    expect(hasConnection(graph, 'card-3', 'card-5')).toBe(true);
    expect(hasConnection(graph, 'card-1', 'card-4')).toBe(true);
  });

  it('maintains immutability through multiple operations', () => {
    const graph0 = createGraph();
    const card = createMockCard('card-1');

    const graph1 = addCard(graph0, card);
    const card2 = createMockCard('card-2');
    const graph2 = addCard(graph1, card2);
    const graph3 = addConnection(graph2, 'card-1', 'card-2');
    const graph4 = removeConnection(graph3, 'card-1', 'card-2');
    const graph5 = removeCard(graph4, 'card-1');

    // All intermediate graphs should still be valid
    expect(graph0.nodes.size).toBe(0);
    expect(graph1.nodes.size).toBe(1);
    expect(graph2.nodes.size).toBe(2);
    expect(graph3.edges.size).toBe(1);
    expect(graph4.edges.size).toBe(0);
    expect(graph5.nodes.size).toBe(1);
    expect(hasCard(graph5, 'card-2')).toBe(true);
  });

  it('correctly traverses disconnected components', () => {
    // Create two separate clusters
    let graph = createGraph();

    // Cluster 1: a -- b -- c
    graph = addCard(graph, createMockCard('a'));
    graph = addCard(graph, createMockCard('b'));
    graph = addCard(graph, createMockCard('c'));
    graph = addConnection(graph, 'a', 'b');
    graph = addConnection(graph, 'b', 'c');

    // Cluster 2: x -- y -- z
    graph = addCard(graph, createMockCard('x'));
    graph = addCard(graph, createMockCard('y'));
    graph = addCard(graph, createMockCard('z'));
    graph = addConnection(graph, 'x', 'y');
    graph = addConnection(graph, 'y', 'z');

    // From 'a', should only reach b and c
    const neighborsFromA = getNeighbors(graph, 'a', 10);
    expect(neighborsFromA.length).toBe(2);
    const idsFromA = neighborsFromA.map(c => c.oracleId);
    expect(idsFromA).toContain('b');
    expect(idsFromA).toContain('c');
    expect(idsFromA).not.toContain('x');
    expect(idsFromA).not.toContain('y');
    expect(idsFromA).not.toContain('z');

    // From 'y', should only reach x and z
    const neighborsFromY = getNeighbors(graph, 'y', 10);
    expect(neighborsFromY.length).toBe(2);
    const idsFromY = neighborsFromY.map(c => c.oracleId);
    expect(idsFromY).toContain('x');
    expect(idsFromY).toContain('z');
    expect(idsFromY).not.toContain('a');
  });
});
