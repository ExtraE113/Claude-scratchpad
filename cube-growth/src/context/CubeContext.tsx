/**
 * React context for cube state management.
 * Provides state, dispatch, and async action helpers to all components.
 */

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  type ReactNode,
  type Dispatch,
} from 'react';

import type { Card, CubeGraph } from '../types';
import { cubeReducer, createInitialState, type CubeState, type CubeAction } from './cubeReducer';
import { getNeighbors } from '../lib/graph';
import { fetchCard } from '../lib/scryfall';
import { getRecommendations } from '../lib/recommender';

/**
 * Context value type including state, dispatch, and async helpers.
 */
interface CubeContextValue {
  /** Current cube state */
  state: CubeState;
  /** Dispatch function for actions */
  dispatch: Dispatch<CubeAction>;
  /** Async helper to add a card by name (fetches from Scryfall) */
  addCardByName: (name: string) => Promise<Card>;
  /** Async helper to fetch recommendations for the selected card */
  fetchRecommendationsForSelected: () => Promise<void>;
  /** Build context cards for recommendation requests */
  buildRecommendationContext: (oracleId: string) => Card[];
}

/**
 * The cube context instance.
 */
const CubeContext = createContext<CubeContextValue | null>(null);

/**
 * Props for the CubeProvider component.
 */
interface CubeProviderProps {
  children: ReactNode;
}

/**
 * Builds context cards for recommendation requests.
 * Returns up to 20 cards: BFS neighbors first, then random cards from the graph.
 *
 * @param graph - The current cube graph
 * @param oracleId - The oracle ID of the source card
 * @returns Array of up to 20 context cards
 */
function buildContextCards(graph: CubeGraph, oracleId: string): Card[] {
  const MAX_CONTEXT_SIZE = 20;

  // Get BFS neighbors first (up to 20)
  const neighbors = getNeighbors(graph, oracleId, MAX_CONTEXT_SIZE);

  // If we have enough from BFS, return early
  if (neighbors.length >= MAX_CONTEXT_SIZE) {
    return neighbors;
  }

  // Build set of oracle IDs we already have
  const includedIds = new Set<string>([
    oracleId,
    ...neighbors.map((c) => c.oracleId),
  ]);

  // Get remaining cards from the graph (excluding source and neighbors)
  const remainingCards: Card[] = [];
  for (const card of graph.nodes.values()) {
    if (!includedIds.has(card.oracleId)) {
      remainingCards.push(card);
    }
  }

  // Shuffle remaining cards using Fisher-Yates
  for (let i = remainingCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remainingCards[i], remainingCards[j]] = [remainingCards[j], remainingCards[i]];
  }

  // Take enough random cards to fill up to MAX_CONTEXT_SIZE
  const needed = MAX_CONTEXT_SIZE - neighbors.length;
  const randomCards = remainingCards.slice(0, needed);

  return [...neighbors, ...randomCards];
}

/**
 * Provider component that wraps the application with cube state.
 */
export function CubeProvider({ children }: CubeProviderProps) {
  const [state, dispatch] = useReducer(cubeReducer, undefined, createInitialState);

  /**
   * Build context cards for a given oracle ID.
   * Exposed for components that need to inspect the context.
   */
  const buildRecommendationContext = useCallback(
    (oracleId: string): Card[] => {
      return buildContextCards(state.graph, oracleId);
    },
    [state.graph]
  );

  /**
   * Async helper to add a card by name.
   * Fetches the card from Scryfall and dispatches ADD_CARD.
   *
   * @param name - The exact card name to add
   * @returns The added Card object
   * @throws Error if the card cannot be fetched
   */
  const addCardByName = useCallback(
    async (name: string): Promise<Card> => {
      const card = await fetchCard(name);
      dispatch({ type: 'ADD_CARD', payload: card });
      return card;
    },
    [dispatch]
  );

  /**
   * Async helper to fetch recommendations for the currently selected card.
   * Updates loading state and handles errors appropriately.
   */
  const fetchRecommendationsForSelected = useCallback(async (): Promise<void> => {
    const { selectedCardId, graph } = state;

    // No card selected
    if (!selectedCardId) {
      dispatch({
        type: 'SET_RECS_ERROR',
        payload: 'No card selected',
      });
      return;
    }

    // Get the selected card
    const selectedCard = graph.nodes.get(selectedCardId);
    if (!selectedCard) {
      dispatch({
        type: 'SET_RECS_ERROR',
        payload: 'Selected card not found in graph',
      });
      return;
    }

    // Set loading state
    dispatch({ type: 'SET_LOADING_RECS', payload: true });

    try {
      // Build context and fetch recommendations
      const contextCards = buildContextCards(graph, selectedCardId);
      const recommendations = await getRecommendations(selectedCard, contextCards, graph);

      // Update recommendations in state
      dispatch({ type: 'SET_RECOMMENDATIONS', payload: recommendations });
    } catch (error) {
      // Handle error
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch recommendations';
      dispatch({ type: 'SET_RECS_ERROR', payload: errorMessage });
    }
  }, [state, dispatch]);

  /**
   * Memoized context value to prevent unnecessary re-renders.
   */
  const contextValue = useMemo<CubeContextValue>(
    () => ({
      state,
      dispatch,
      addCardByName,
      fetchRecommendationsForSelected,
      buildRecommendationContext,
    }),
    [state, dispatch, addCardByName, fetchRecommendationsForSelected, buildRecommendationContext]
  );

  return <CubeContext.Provider value={contextValue}>{children}</CubeContext.Provider>;
}

/**
 * Hook to access the cube context.
 * Must be used within a CubeProvider.
 *
 * @returns The cube context value
 * @throws Error if used outside of CubeProvider
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useCube(): CubeContextValue {
  const context = useContext(CubeContext);

  if (context === null) {
    throw new Error('useCube must be used within a CubeProvider');
  }

  return context;
}
