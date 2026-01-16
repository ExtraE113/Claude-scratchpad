/**
 * Unit tests for Personalized PageRank weight calculation
 */

import { describe, it, expect } from 'vitest';
import { calculatePPRWeights, buildWeightedCardNames } from './pprWeights';
import type { Card, CubeGraph } from '../types';
import { createGraph, addCard, addConnection } from './graph';

// Helper to create mock Card objects
function createMockCard(name: string, oracleId: string): Card {
  return {
    oracleId,
    name,
    imageUri: `https://example.com/${oracleId}.jpg`,
    artCropUri: `https://example.com/${oracleId}-crop.jpg`,
    manaCost: '{1}{R}',
    cmc: 2,
    colors: ['R'],
    colorIdentity: ['R'],
    typeLine: 'Instant',
    oracleText: 'Test card',
  };
}

// Helper to create a graph with cards and edges
function createTestGraph(
  cards: Card[],
  edges: Array<[string, string]> = []
): CubeGraph {
  let graph = createGraph();
  for (const card of cards) {
    graph = addCard(graph, card);
  }
  for (const [a, b] of edges) {
    graph = addConnection(graph, a, b);
  }
  return graph;
}

describe('calculatePPRWeights', () => {
  it('returns weight 10 for empty graph', () => {
    const graph = createGraph();
    const weights = calculatePPRWeights(graph, 'selected-id');

    expect(weights.get('selected-id')).toBe(10);
    expect(weights.size).toBe(1);
  });

  it('returns weight 10 for single node graph', () => {
    const card = createMockCard('Lightning Bolt', 'bolt-id');
    const graph = createTestGraph([card]);

    const weights = calculatePPRWeights(graph, 'bolt-id');

    expect(weights.get('bolt-id')).toBe(10);
    expect(weights.size).toBe(1);
  });

  it('gives selected card weight 10 always', () => {
    const cards = [
      createMockCard('Card A', 'a'),
      createMockCard('Card B', 'b'),
      createMockCard('Card C', 'c'),
    ];
    const graph = createTestGraph(cards, [['a', 'b'], ['b', 'c']]);

    const weights = calculatePPRWeights(graph, 'b');

    expect(weights.get('b')).toBe(10);
  });

  it('gives higher weights to directly connected cards in linear chain', () => {
    // Create a linear chain: A -- B -- C -- D -- E
    const cards = [
      createMockCard('Card A', 'a'),
      createMockCard('Card B', 'b'),
      createMockCard('Card C', 'c'),
      createMockCard('Card D', 'd'),
      createMockCard('Card E', 'e'),
    ];
    const graph = createTestGraph(cards, [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'e'],
    ]);

    // Select card A - neighbors should have decreasing weights
    const weights = calculatePPRWeights(graph, 'a');

    expect(weights.get('a')).toBe(10); // Selected always 10
    // B is directly connected to A, should have higher weight than C
    expect(weights.get('b')!).toBeGreaterThan(weights.get('c')!);
    // C should have higher weight than D
    expect(weights.get('c')!).toBeGreaterThan(weights.get('d')!);
    // D should have higher or equal weight than E
    expect(weights.get('d')!).toBeGreaterThanOrEqual(weights.get('e')!);
  });

  it('gives high weights to hub cards in star graph', () => {
    // Create a star graph: A is the hub, B, C, D, E are spokes
    const cards = [
      createMockCard('Hub', 'hub'),
      createMockCard('Spoke 1', 's1'),
      createMockCard('Spoke 2', 's2'),
      createMockCard('Spoke 3', 's3'),
      createMockCard('Spoke 4', 's4'),
    ];
    const graph = createTestGraph(cards, [
      ['hub', 's1'],
      ['hub', 's2'],
      ['hub', 's3'],
      ['hub', 's4'],
    ]);

    // Select spoke 1 - hub should have high weight (it's a bridge)
    const weights = calculatePPRWeights(graph, 's1');

    expect(weights.get('s1')).toBe(10); // Selected
    // Hub should have decent weight since it's directly connected
    expect(weights.get('hub')!).toBeGreaterThanOrEqual(5);
    // Other spokes should have lower weight (2 hops away)
    expect(weights.get('hub')!).toBeGreaterThanOrEqual(weights.get('s2')!);
  });

  it('gives low weights to disconnected components', () => {
    // Create two disconnected components: A--B and C--D
    const cards = [
      createMockCard('Card A', 'a'),
      createMockCard('Card B', 'b'),
      createMockCard('Card C', 'c'),
      createMockCard('Card D', 'd'),
    ];
    const graph = createTestGraph(cards, [
      ['a', 'b'],
      ['c', 'd'],
    ]);

    // Select card A - cards C and D should have low weights (disconnected)
    const weights = calculatePPRWeights(graph, 'a');

    expect(weights.get('a')).toBe(10);
    expect(weights.get('b')!).toBeGreaterThan(1);
    // Disconnected cards should have minimal weights (1 or 2 due to normalization)
    expect(weights.get('c')!).toBeLessThanOrEqual(2);
    expect(weights.get('d')!).toBeLessThanOrEqual(2);
    // Connected card should have higher weight than disconnected ones
    expect(weights.get('b')!).toBeGreaterThan(weights.get('c')!);
  });

  it('handles node with no edges (isolated node)', () => {
    const cards = [
      createMockCard('Connected A', 'a'),
      createMockCard('Connected B', 'b'),
      createMockCard('Isolated', 'isolated'),
    ];
    const graph = createTestGraph(cards, [['a', 'b']]);

    // Select the isolated node
    const weights = calculatePPRWeights(graph, 'isolated');

    expect(weights.get('isolated')).toBe(10);
    // Other nodes should have weight 1 (not connected to selected)
    expect(weights.get('a')).toBe(1);
    expect(weights.get('b')).toBe(1);
  });

  it('weights are integers in range 1-10', () => {
    const cards = Array.from({ length: 20 }, (_, i) =>
      createMockCard(`Card ${i}`, `id-${i}`)
    );
    // Create a chain
    const edges: Array<[string, string]> = [];
    for (let i = 0; i < 19; i++) {
      edges.push([`id-${i}`, `id-${i + 1}`]);
    }
    const graph = createTestGraph(cards, edges);

    const weights = calculatePPRWeights(graph, 'id-0');

    for (const [, weight] of weights.entries()) {
      expect(Number.isInteger(weight)).toBe(true);
      expect(weight).toBeGreaterThanOrEqual(1);
      expect(weight).toBeLessThanOrEqual(10);
    }
  });

  it('handles complex graph with cycles', () => {
    // Create a graph with cycles: A--B--C--A, D connected to B
    const cards = [
      createMockCard('Card A', 'a'),
      createMockCard('Card B', 'b'),
      createMockCard('Card C', 'c'),
      createMockCard('Card D', 'd'),
    ];
    const graph = createTestGraph(cards, [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'], // cycle
      ['b', 'd'],
    ]);

    // This should not hang or error
    const weights = calculatePPRWeights(graph, 'a');

    expect(weights.size).toBe(4);
    expect(weights.get('a')).toBe(10);
    // All connected nodes should have weights > 1
    expect(weights.get('b')!).toBeGreaterThan(1);
    expect(weights.get('c')!).toBeGreaterThan(1);
  });
});

describe('buildWeightedCardNames', () => {
  it('returns empty array for empty input', () => {
    const result = buildWeightedCardNames([], new Map());
    expect(result).toEqual([]);
  });

  it('repeats card names based on weights', () => {
    const cardNames: Array<[string, string]> = [
      ['id-a', 'Lightning Bolt'],
      ['id-b', 'Chain Lightning'],
    ];
    const weights = new Map([
      ['id-a', 3],
      ['id-b', 2],
    ]);

    const result = buildWeightedCardNames(cardNames, weights);

    // Lightning Bolt should appear 3 times
    expect(result.filter(n => n === 'Lightning Bolt')).toHaveLength(3);
    // Chain Lightning should appear 2 times
    expect(result.filter(n => n === 'Chain Lightning')).toHaveLength(2);
  });

  it('uses default weight of 1 for unknown cards', () => {
    const cardNames: Array<[string, string]> = [
      ['id-a', 'Known Card'],
      ['id-unknown', 'Unknown Card'],
    ];
    const weights = new Map([['id-a', 5]]);

    const result = buildWeightedCardNames(cardNames, weights);

    expect(result.filter(n => n === 'Known Card')).toHaveLength(5);
    expect(result.filter(n => n === 'Unknown Card')).toHaveLength(1);
  });

  it('respects maxEntries limit', () => {
    const cardNames: Array<[string, string]> = [
      ['id-a', 'Card A'],
      ['id-b', 'Card B'],
    ];
    const weights = new Map([
      ['id-a', 10],
      ['id-b', 10],
    ]);

    const result = buildWeightedCardNames(cardNames, weights, 15);

    expect(result.length).toBe(15);
    // Card A should get all 10
    expect(result.filter(n => n === 'Card A')).toHaveLength(10);
    // Card B should get remaining 5
    expect(result.filter(n => n === 'Card B')).toHaveLength(5);
  });

  it('handles maxEntries of 0', () => {
    const cardNames: Array<[string, string]> = [['id-a', 'Card A']];
    const weights = new Map([['id-a', 10]]);

    const result = buildWeightedCardNames(cardNames, weights, 0);

    expect(result).toEqual([]);
  });

  it('processes cards in order', () => {
    const cardNames: Array<[string, string]> = [
      ['id-first', 'First Card'],
      ['id-second', 'Second Card'],
      ['id-third', 'Third Card'],
    ];
    const weights = new Map([
      ['id-first', 2],
      ['id-second', 2],
      ['id-third', 2],
    ]);

    const result = buildWeightedCardNames(cardNames, weights);

    // First two entries should be 'First Card'
    expect(result[0]).toBe('First Card');
    expect(result[1]).toBe('First Card');
    // Next two should be 'Second Card'
    expect(result[2]).toBe('Second Card');
    expect(result[3]).toBe('Second Card');
    // Last two should be 'Third Card'
    expect(result[4]).toBe('Third Card');
    expect(result[5]).toBe('Third Card');
  });

  it('handles weight of 0 (skips the card)', () => {
    const cardNames: Array<[string, string]> = [
      ['id-a', 'Card A'],
      ['id-b', 'Card B'],
    ];
    const weights = new Map([
      ['id-a', 0],
      ['id-b', 3],
    ]);

    const result = buildWeightedCardNames(cardNames, weights);

    expect(result.filter(n => n === 'Card A')).toHaveLength(0);
    expect(result.filter(n => n === 'Card B')).toHaveLength(3);
  });
});
