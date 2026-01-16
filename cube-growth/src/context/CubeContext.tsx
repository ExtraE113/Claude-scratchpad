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

import type { Card } from '../types';
import { cubeReducer, createInitialState, type CubeState, type CubeAction, type NotificationType } from './cubeReducer';
import { hasCard } from '../lib/graph';
import { fetchCard } from '../lib/scryfall';
import { getLiftRecommendations } from '../lib/liftRecommender';

/**
 * Result of adding a card - indicates whether the card was added or was a duplicate.
 */
interface AddCardResult {
  /** The card that was requested */
  card: Card;
  /** Whether the card was already in the cube */
  wasDuplicate: boolean;
}

/**
 * Context value type including state, dispatch, and async helpers.
 */
interface CubeContextValue {
  /** Current cube state */
  state: CubeState;
  /** Dispatch function for actions */
  dispatch: Dispatch<CubeAction>;
  /** Async helper to add a card by name (fetches from Scryfall) */
  addCardByName: (name: string) => Promise<AddCardResult>;
  /** Async helper to fetch recommendations for the selected card */
  fetchRecommendationsForSelected: () => Promise<void>;
  /** Helper to show a notification message */
  showNotification: (message: string, type?: NotificationType) => void;
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
 * Provider component that wraps the application with cube state.
 */
export function CubeProvider({ children }: CubeProviderProps) {
  const [state, dispatch] = useReducer(cubeReducer, undefined, createInitialState);

  /**
   * Helper to show a notification message.
   * Creates a unique ID for the notification to support auto-dismissal.
   *
   * @param message - The message to display
   * @param type - The type of notification (default: 'info')
   */
  const showNotification = useCallback(
    (message: string, type: NotificationType = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      dispatch({
        type: 'SET_NOTIFICATION',
        payload: { id, message, type },
      });
    },
    [dispatch]
  );

  /**
   * Async helper to add a card by name.
   * Fetches the card from Scryfall and dispatches ADD_CARD.
   * Shows a warning notification if the card is already in the cube.
   *
   * @param name - The exact card name to add
   * @returns Object containing the card and whether it was a duplicate
   * @throws Error if the card cannot be fetched
   */
  const addCardByName = useCallback(
    async (name: string): Promise<AddCardResult> => {
      const card = await fetchCard(name);

      // Check if the card is already in the cube
      const isDuplicate = hasCard(state.graph, card.oracleId);

      if (isDuplicate) {
        showNotification(`"${card.name}" is already in your cube`, 'warning');
        return { card, wasDuplicate: true };
      }

      dispatch({ type: 'ADD_CARD', payload: card });
      return { card, wasDuplicate: false };
    },
    [dispatch, state.graph, showNotification]
  );

  /**
   * Async helper to fetch recommendations for the currently selected card.
   * Uses lift-based recommendation aggregating synergy data from all cube cards.
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
      // Fetch recommendations using lift-based aggregation
      const recommendations = await getLiftRecommendations(selectedCard, graph);

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
      showNotification,
    }),
    [state, dispatch, addCardByName, fetchRecommendationsForSelected, showNotification]
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
