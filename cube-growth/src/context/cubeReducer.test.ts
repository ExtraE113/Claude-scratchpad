/**
 * Unit tests for the cube reducer.
 */

import { describe, it, expect } from 'vitest';
import { cubeReducer, createInitialState } from './cubeReducer';
import type { CubeAction } from './cubeReducer';
import type { Card, Recommendation } from '../types';
import { makeEdgeKey } from '../types';

// =============================================================================
// Mock Data
// =============================================================================

/**
 * Creates a mock Card with the given oracle ID and name.
 */
function createMockCard(oracleId: string, name: string): Card {
  return {
    oracleId,
    name,
    imageUri: `https://example.com/images/${oracleId}.jpg`,
    artCropUri: `https://example.com/art/${oracleId}.jpg`,
    manaCost: '{2}{B}{B}',
    cmc: 4,
    colors: ['B'],
    colorIdentity: ['B'],
    typeLine: 'Creature - Zombie',
    oracleText: 'Mock card text',
    power: '4',
    toughness: '4',
  };
}

/**
 * Creates a mock Recommendation with the given card and score.
 */
function createMockRecommendation(
  card: Card,
  score: number,
  alreadyInGraph = false
): Recommendation {
  return {
    card,
    score,
    reason: `Recommended because of synergy (score: ${score})`,
    alreadyInGraph,
  };
}

// Sample cards for testing
const cardA = createMockCard('oracle-a', 'Dark Ritual');
const cardB = createMockCard('oracle-b', 'Lightning Bolt');
const cardC = createMockCard('oracle-c', 'Counterspell');
const cardD = createMockCard('oracle-d', 'Birds of Paradise');

// Sample recommendations for testing
const recCard1 = createMockCard('rec-1', 'Recommended Card 1');
const recCard2 = createMockCard('rec-2', 'Recommended Card 2');
const recommendation1 = createMockRecommendation(recCard1, 85);
const recommendation2 = createMockRecommendation(recCard2, 72, true);

// =============================================================================
// Test Suites
// =============================================================================

describe('cubeReducer', () => {
  // ===========================================================================
  // Initial State Tests
  // ===========================================================================
  describe('createInitialState', () => {
    it('has empty graph with no nodes', () => {
      const state = createInitialState();
      expect(state.graph.nodes.size).toBe(0);
    });

    it('has empty graph with no edges', () => {
      const state = createInitialState();
      expect(state.graph.edges.size).toBe(0);
    });

    it('has null selectedCardId', () => {
      const state = createInitialState();
      expect(state.selectedCardId).toBeNull();
    });

    it('has empty recommendations array', () => {
      const state = createInitialState();
      expect(state.recommendations).toEqual([]);
    });

    it('has isLoadingRecs set to false', () => {
      const state = createInitialState();
      expect(state.isLoadingRecs).toBe(false);
    });

    it('has recsError set to null', () => {
      const state = createInitialState();
      expect(state.recsError).toBeNull();
    });
  });

  // ===========================================================================
  // ADD_CARD Action Tests
  // ===========================================================================
  describe('ADD_CARD action', () => {
    it('adds a card to an empty graph', () => {
      const state = createInitialState();
      const action: CubeAction = { type: 'ADD_CARD', payload: cardA };

      const newState = cubeReducer(state, action);

      expect(newState.graph.nodes.size).toBe(1);
      expect(newState.graph.nodes.has(cardA.oracleId)).toBe(true);
      expect(newState.graph.nodes.get(cardA.oracleId)).toEqual(cardA);
    });

    it('adds multiple cards to the graph', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardC });

      expect(state.graph.nodes.size).toBe(3);
      expect(state.graph.nodes.has(cardA.oracleId)).toBe(true);
      expect(state.graph.nodes.has(cardB.oracleId)).toBe(true);
      expect(state.graph.nodes.has(cardC.oracleId)).toBe(true);
    });

    it('does not add duplicate cards', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      const stateAfterFirst = state;
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });

      expect(state.graph.nodes.size).toBe(1);
      // Should return the same graph reference when card already exists
      expect(state.graph).toBe(stateAfterFirst.graph);
    });

    it('preserves selectedCardId when adding a card', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });

      expect(state.selectedCardId).toBe(cardA.oracleId);
    });

    it('preserves recommendations when adding a card', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation1, recommendation2],
      });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });

      expect(state.recommendations).toEqual([recommendation1, recommendation2]);
    });

    it('preserves isLoadingRecs when adding a card', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'SET_LOADING_RECS', payload: true });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });

      expect(state.isLoadingRecs).toBe(true);
    });

    it('preserves recsError when adding a card', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'SET_RECS_ERROR', payload: 'Test error' });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });

      expect(state.recsError).toBe('Test error');
    });

    it('preserves existing edges when adding a card', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardC });

      expect(state.graph.edges.size).toBe(1);
      expect(
        state.graph.edges.has(makeEdgeKey(cardA.oracleId, cardB.oracleId))
      ).toBe(true);
    });
  });

  // ===========================================================================
  // REMOVE_CARD Action Tests
  // ===========================================================================
  describe('REMOVE_CARD action', () => {
    it('removes a card from the graph', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, { type: 'REMOVE_CARD', payload: cardA.oracleId });

      expect(state.graph.nodes.size).toBe(1);
      expect(state.graph.nodes.has(cardA.oracleId)).toBe(false);
      expect(state.graph.nodes.has(cardB.oracleId)).toBe(true);
    });

    it('handles removing a card that does not exist', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      const stateBeforeRemove = state;
      state = cubeReducer(state, { type: 'REMOVE_CARD', payload: 'non-existent-id' });

      expect(state.graph.nodes.size).toBe(1);
      // Should return same graph reference when card doesn't exist
      expect(state.graph).toBe(stateBeforeRemove.graph);
    });

    it('clears selectedCardId when removed card was selected', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, { type: 'REMOVE_CARD', payload: cardA.oracleId });

      expect(state.selectedCardId).toBeNull();
    });

    it('clears recommendations when removed card was selected', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation1, recommendation2],
      });
      state = cubeReducer(state, { type: 'REMOVE_CARD', payload: cardA.oracleId });

      expect(state.recommendations).toEqual([]);
    });

    it('preserves selectedCardId when different card was removed', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, { type: 'REMOVE_CARD', payload: cardB.oracleId });

      expect(state.selectedCardId).toBe(cardA.oracleId);
    });

    it('preserves recommendations when different card was removed', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation1, recommendation2],
      });
      state = cubeReducer(state, { type: 'REMOVE_CARD', payload: cardB.oracleId });

      expect(state.recommendations).toEqual([recommendation1, recommendation2]);
    });

    it('removes associated edges when card is removed', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardC });
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardB.oracleId, idB: cardC.oracleId },
      });
      state = cubeReducer(state, { type: 'REMOVE_CARD', payload: cardB.oracleId });

      expect(state.graph.edges.size).toBe(0);
      expect(state.graph.nodes.size).toBe(2);
    });

    it('preserves unrelated edges when card is removed', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardC });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardD });
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardC.oracleId, idB: cardD.oracleId },
      });
      state = cubeReducer(state, { type: 'REMOVE_CARD', payload: cardA.oracleId });

      expect(state.graph.edges.size).toBe(1);
      expect(
        state.graph.edges.has(makeEdgeKey(cardC.oracleId, cardD.oracleId))
      ).toBe(true);
    });
  });

  // ===========================================================================
  // ADD_CONNECTION Action Tests
  // ===========================================================================
  describe('ADD_CONNECTION action', () => {
    it('adds an edge between two existing cards', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });

      expect(state.graph.edges.size).toBe(1);
      expect(
        state.graph.edges.has(makeEdgeKey(cardA.oracleId, cardB.oracleId))
      ).toBe(true);
    });

    it('does not add edge when first card does not exist', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      const stateBeforeAdd = state;
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: 'non-existent', idB: cardB.oracleId },
      });

      expect(state.graph.edges.size).toBe(0);
      expect(state.graph).toBe(stateBeforeAdd.graph);
    });

    it('does not add edge when second card does not exist', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      const stateBeforeAdd = state;
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardA.oracleId, idB: 'non-existent' },
      });

      expect(state.graph.edges.size).toBe(0);
      expect(state.graph).toBe(stateBeforeAdd.graph);
    });

    it('does not add edge when neither card exists', () => {
      let state = createInitialState();
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: 'non-existent-a', idB: 'non-existent-b' },
      });

      expect(state.graph.edges.size).toBe(0);
    });

    it('does not add self-loop edge', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      const stateBeforeAdd = state;
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardA.oracleId },
      });

      expect(state.graph.edges.size).toBe(0);
      expect(state.graph).toBe(stateBeforeAdd.graph);
    });

    it('does not add duplicate edges', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });
      const stateAfterFirst = state;
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });

      expect(state.graph.edges.size).toBe(1);
      expect(state.graph).toBe(stateAfterFirst.graph);
    });

    it('treats edge as undirected (idA, idB same as idB, idA)', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });
      const stateAfterFirst = state;
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardB.oracleId, idB: cardA.oracleId },
      });

      expect(state.graph.edges.size).toBe(1);
      expect(state.graph).toBe(stateAfterFirst.graph);
    });

    it('preserves other state properties when adding connection', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation1],
      });
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });

      expect(state.selectedCardId).toBe(cardA.oracleId);
      expect(state.recommendations).toEqual([recommendation1]);
    });
  });

  // ===========================================================================
  // REMOVE_CONNECTION Action Tests
  // ===========================================================================
  describe('REMOVE_CONNECTION action', () => {
    it('removes an existing edge between two cards', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });
      state = cubeReducer(state, {
        type: 'REMOVE_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });

      expect(state.graph.edges.size).toBe(0);
    });

    it('preserves both cards when removing connection', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });
      state = cubeReducer(state, {
        type: 'REMOVE_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });

      expect(state.graph.nodes.size).toBe(2);
      expect(state.graph.nodes.has(cardA.oracleId)).toBe(true);
      expect(state.graph.nodes.has(cardB.oracleId)).toBe(true);
    });

    it('handles removing non-existent edge', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      const stateBeforeRemove = state;
      state = cubeReducer(state, {
        type: 'REMOVE_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });

      expect(state.graph.edges.size).toBe(0);
      expect(state.graph).toBe(stateBeforeRemove.graph);
    });

    it('works with reversed ID order (undirected)', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });
      // Remove with reversed order
      state = cubeReducer(state, {
        type: 'REMOVE_CONNECTION',
        payload: { idA: cardB.oracleId, idB: cardA.oracleId },
      });

      expect(state.graph.edges.size).toBe(0);
    });

    it('only removes the specified edge', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardC });
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardB.oracleId, idB: cardC.oracleId },
      });
      state = cubeReducer(state, {
        type: 'REMOVE_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });

      expect(state.graph.edges.size).toBe(1);
      expect(
        state.graph.edges.has(makeEdgeKey(cardB.oracleId, cardC.oracleId))
      ).toBe(true);
    });

    it('preserves other state properties when removing connection', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation1],
      });
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });
      state = cubeReducer(state, {
        type: 'REMOVE_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });

      expect(state.selectedCardId).toBe(cardA.oracleId);
      expect(state.recommendations).toEqual([recommendation1]);
    });
  });

  // ===========================================================================
  // SELECT_CARD Action Tests
  // ===========================================================================
  describe('SELECT_CARD action', () => {
    it('sets selectedCardId to the specified card', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });

      expect(state.selectedCardId).toBe(cardA.oracleId);
    });

    it('changes selection to a different card', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardB.oracleId });

      expect(state.selectedCardId).toBe(cardB.oracleId);
    });

    it('clears recommendations when selection changes', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation1, recommendation2],
      });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardB.oracleId });

      expect(state.recommendations).toEqual([]);
    });

    it('clears recsError when selection changes', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, {
        type: 'SET_RECS_ERROR',
        payload: 'Failed to load recommendations',
      });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardB.oracleId });

      expect(state.recsError).toBeNull();
    });

    it('preserves recommendations when selecting the same card', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation1, recommendation2],
      });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });

      expect(state.recommendations).toEqual([recommendation1, recommendation2]);
    });

    it('preserves recsError when selecting the same card', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, {
        type: 'SET_RECS_ERROR',
        payload: 'Failed to load recommendations',
      });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });

      expect(state.recsError).toBe('Failed to load recommendations');
    });

    it('setting to null clears selection', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: null });

      expect(state.selectedCardId).toBeNull();
    });

    it('clears recommendations when setting selection to null', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation1],
      });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: null });

      expect(state.recommendations).toEqual([]);
    });

    it('clears recsError when setting selection to null', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, { type: 'SET_RECS_ERROR', payload: 'Error!' });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: null });

      expect(state.recsError).toBeNull();
    });

    it('preserves graph when changing selection', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });
      const graphBeforeSelect = state.graph;
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });

      expect(state.graph).toBe(graphBeforeSelect);
      expect(state.graph.nodes.size).toBe(2);
      expect(state.graph.edges.size).toBe(1);
    });
  });

  // ===========================================================================
  // SET_RECOMMENDATIONS Action Tests
  // ===========================================================================
  describe('SET_RECOMMENDATIONS action', () => {
    it('updates recommendations array', () => {
      let state = createInitialState();
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation1, recommendation2],
      });

      expect(state.recommendations).toEqual([recommendation1, recommendation2]);
    });

    it('replaces existing recommendations', () => {
      let state = createInitialState();
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation1],
      });
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation2],
      });

      expect(state.recommendations).toEqual([recommendation2]);
    });

    it('can set empty recommendations array', () => {
      let state = createInitialState();
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation1, recommendation2],
      });
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [],
      });

      expect(state.recommendations).toEqual([]);
    });

    it('sets isLoadingRecs to false', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'SET_LOADING_RECS', payload: true });
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation1],
      });

      expect(state.isLoadingRecs).toBe(false);
    });

    it('clears recsError', () => {
      let state = createInitialState();
      state = cubeReducer(state, {
        type: 'SET_RECS_ERROR',
        payload: 'Previous error',
      });
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation1],
      });

      expect(state.recsError).toBeNull();
    });

    it('preserves selectedCardId', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation1],
      });

      expect(state.selectedCardId).toBe(cardA.oracleId);
    });

    it('preserves graph', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      const graphBefore = state.graph;
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation1],
      });

      expect(state.graph).toBe(graphBefore);
    });
  });

  // ===========================================================================
  // SET_LOADING_RECS Action Tests
  // ===========================================================================
  describe('SET_LOADING_RECS action', () => {
    it('sets isLoadingRecs to true', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'SET_LOADING_RECS', payload: true });

      expect(state.isLoadingRecs).toBe(true);
    });

    it('sets isLoadingRecs to false', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'SET_LOADING_RECS', payload: true });
      state = cubeReducer(state, { type: 'SET_LOADING_RECS', payload: false });

      expect(state.isLoadingRecs).toBe(false);
    });

    it('clears recsError when starting to load (setting to true)', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'SET_RECS_ERROR', payload: 'Previous error' });
      state = cubeReducer(state, { type: 'SET_LOADING_RECS', payload: true });

      expect(state.recsError).toBeNull();
    });

    it('preserves recsError when stopping loading (setting to false)', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'SET_RECS_ERROR', payload: 'Error message' });
      state = cubeReducer(state, { type: 'SET_LOADING_RECS', payload: false });

      expect(state.recsError).toBe('Error message');
    });

    it('preserves selectedCardId', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, { type: 'SET_LOADING_RECS', payload: true });

      expect(state.selectedCardId).toBe(cardA.oracleId);
    });

    it('preserves recommendations', () => {
      let state = createInitialState();
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation1],
      });
      state = cubeReducer(state, { type: 'SET_LOADING_RECS', payload: true });

      expect(state.recommendations).toEqual([recommendation1]);
    });

    it('preserves graph', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      const graphBefore = state.graph;
      state = cubeReducer(state, { type: 'SET_LOADING_RECS', payload: true });

      expect(state.graph).toBe(graphBefore);
    });
  });

  // ===========================================================================
  // SET_RECS_ERROR Action Tests
  // ===========================================================================
  describe('SET_RECS_ERROR action', () => {
    it('sets error message', () => {
      let state = createInitialState();
      state = cubeReducer(state, {
        type: 'SET_RECS_ERROR',
        payload: 'Failed to fetch recommendations',
      });

      expect(state.recsError).toBe('Failed to fetch recommendations');
    });

    it('replaces existing error message', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'SET_RECS_ERROR', payload: 'First error' });
      state = cubeReducer(state, { type: 'SET_RECS_ERROR', payload: 'Second error' });

      expect(state.recsError).toBe('Second error');
    });

    it('setting to null clears error', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'SET_RECS_ERROR', payload: 'Error message' });
      state = cubeReducer(state, { type: 'SET_RECS_ERROR', payload: null });

      expect(state.recsError).toBeNull();
    });

    it('sets isLoadingRecs to false', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'SET_LOADING_RECS', payload: true });
      state = cubeReducer(state, { type: 'SET_RECS_ERROR', payload: 'Error occurred' });

      expect(state.isLoadingRecs).toBe(false);
    });

    it('sets isLoadingRecs to false even when clearing error', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'SET_LOADING_RECS', payload: true });
      state = cubeReducer(state, { type: 'SET_RECS_ERROR', payload: null });

      expect(state.isLoadingRecs).toBe(false);
    });

    it('preserves selectedCardId', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, { type: 'SET_RECS_ERROR', payload: 'Error!' });

      expect(state.selectedCardId).toBe(cardA.oracleId);
    });

    it('preserves recommendations', () => {
      let state = createInitialState();
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation1],
      });
      state = cubeReducer(state, { type: 'SET_RECS_ERROR', payload: 'Error!' });

      expect(state.recommendations).toEqual([recommendation1]);
    });

    it('preserves graph', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      const graphBefore = state.graph;
      state = cubeReducer(state, { type: 'SET_RECS_ERROR', payload: 'Error!' });

      expect(state.graph).toBe(graphBefore);
    });
  });

  // ===========================================================================
  // State Immutability Tests
  // ===========================================================================
  describe('state immutability', () => {
    it('does not mutate original state when adding card', () => {
      const originalState = createInitialState();
      const originalNodes = originalState.graph.nodes;
      cubeReducer(originalState, { type: 'ADD_CARD', payload: cardA });

      expect(originalState.graph.nodes).toBe(originalNodes);
      expect(originalState.graph.nodes.size).toBe(0);
    });

    it('does not mutate original state when removing card', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      const stateBeforeRemove = state;
      const nodesBeforeRemove = state.graph.nodes;
      cubeReducer(state, { type: 'REMOVE_CARD', payload: cardA.oracleId });

      expect(stateBeforeRemove.graph.nodes).toBe(nodesBeforeRemove);
      expect(stateBeforeRemove.graph.nodes.size).toBe(1);
    });

    it('does not mutate original state when adding connection', () => {
      let state = createInitialState();
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      const stateBeforeConnect = state;
      const edgesBeforeConnect = state.graph.edges;
      cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });

      expect(stateBeforeConnect.graph.edges).toBe(edgesBeforeConnect);
      expect(stateBeforeConnect.graph.edges.size).toBe(0);
    });

    it('returns new state object for each action', () => {
      const state1 = createInitialState();
      const state2 = cubeReducer(state1, { type: 'ADD_CARD', payload: cardA });
      const state3 = cubeReducer(state2, { type: 'SELECT_CARD', payload: cardA.oracleId });

      expect(state1).not.toBe(state2);
      expect(state2).not.toBe(state3);
    });
  });

  // ===========================================================================
  // Complex State Transitions Tests
  // ===========================================================================
  describe('complex state transitions', () => {
    it('handles full workflow: add cards, connect, select, get recommendations', () => {
      let state = createInitialState();

      // Add cards
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardC });

      // Connect cards
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardA.oracleId, idB: cardB.oracleId },
      });
      state = cubeReducer(state, {
        type: 'ADD_CONNECTION',
        payload: { idA: cardB.oracleId, idB: cardC.oracleId },
      });

      // Select card
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });

      // Start loading recommendations
      state = cubeReducer(state, { type: 'SET_LOADING_RECS', payload: true });

      // Receive recommendations
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation1, recommendation2],
      });

      // Verify final state
      expect(state.graph.nodes.size).toBe(3);
      expect(state.graph.edges.size).toBe(2);
      expect(state.selectedCardId).toBe(cardA.oracleId);
      expect(state.recommendations).toEqual([recommendation1, recommendation2]);
      expect(state.isLoadingRecs).toBe(false);
      expect(state.recsError).toBeNull();
    });

    it('handles error during recommendation loading', () => {
      let state = createInitialState();

      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, { type: 'SET_LOADING_RECS', payload: true });
      state = cubeReducer(state, {
        type: 'SET_RECS_ERROR',
        payload: 'Network error',
      });

      expect(state.selectedCardId).toBe(cardA.oracleId);
      expect(state.isLoadingRecs).toBe(false);
      expect(state.recsError).toBe('Network error');
      expect(state.recommendations).toEqual([]);
    });

    it('handles selection change during loading', () => {
      let state = createInitialState();

      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, { type: 'SET_LOADING_RECS', payload: true });

      // Change selection mid-loading
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardB.oracleId });

      expect(state.selectedCardId).toBe(cardB.oracleId);
      expect(state.recommendations).toEqual([]);
      expect(state.recsError).toBeNull();
      // Note: isLoadingRecs is still true; the app should handle cancellation separately
      expect(state.isLoadingRecs).toBe(true);
    });

    it('handles removing selected card with recommendations', () => {
      let state = createInitialState();

      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardA });
      state = cubeReducer(state, { type: 'ADD_CARD', payload: cardB });
      state = cubeReducer(state, { type: 'SELECT_CARD', payload: cardA.oracleId });
      state = cubeReducer(state, {
        type: 'SET_RECOMMENDATIONS',
        payload: [recommendation1, recommendation2],
      });
      state = cubeReducer(state, { type: 'REMOVE_CARD', payload: cardA.oracleId });

      expect(state.selectedCardId).toBeNull();
      expect(state.recommendations).toEqual([]);
      expect(state.graph.nodes.size).toBe(1);
      expect(state.graph.nodes.has(cardB.oracleId)).toBe(true);
    });
  });
});
