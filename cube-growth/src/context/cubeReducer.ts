/**
 * Reducer for managing cube state in the MTG Cube Growth Tool.
 * All state changes are immutable and handled through actions.
 */

import type { Card, CubeGraph, Recommendation } from '../types';
import {
  createGraph,
  addCard as graphAddCard,
  removeCard as graphRemoveCard,
  addConnection as graphAddConnection,
  removeConnection as graphRemoveConnection,
} from '../lib/graph';

/**
 * Notification types for toast messages.
 */
export type NotificationType = 'info' | 'warning' | 'error' | 'success';

/**
 * Notification state for toast messages.
 */
export interface Notification {
  /** Unique ID for the notification */
  id: string;
  /** The message to display */
  message: string;
  /** Type of notification (affects styling) */
  type: NotificationType;
}

/**
 * The shape of the cube state.
 */
export interface CubeState {
  /** The graph containing all cards and their connections */
  graph: CubeGraph;
  /** Currently selected card's oracle ID, or null if none selected */
  selectedCardId: string | null;
  /** Current recommendations for the selected card */
  recommendations: Recommendation[];
  /** Whether recommendations are currently being fetched */
  isLoadingRecs: boolean;
  /** Error message if recommendation fetch failed, or null */
  recsError: string | null;
  /** Current notification to display, or null */
  notification: Notification | null;
}

/**
 * Action types for the cube reducer.
 */
export type CubeAction =
  | { type: 'ADD_CARD'; payload: Card }
  | { type: 'REMOVE_CARD'; payload: string }
  | { type: 'ADD_CONNECTION'; payload: { idA: string; idB: string } }
  | { type: 'REMOVE_CONNECTION'; payload: { idA: string; idB: string } }
  | { type: 'SELECT_CARD'; payload: string | null }
  | { type: 'SET_RECOMMENDATIONS'; payload: Recommendation[] }
  | { type: 'SET_LOADING_RECS'; payload: boolean }
  | { type: 'SET_RECS_ERROR'; payload: string | null }
  | { type: 'SET_NOTIFICATION'; payload: Notification }
  | { type: 'CLEAR_NOTIFICATION'; payload?: string };

/**
 * Creates the initial cube state with an empty graph.
 */
export function createInitialState(): CubeState {
  return {
    graph: createGraph(),
    selectedCardId: null,
    recommendations: [],
    isLoadingRecs: false,
    recsError: null,
    notification: null,
  };
}

/**
 * Reducer function for cube state.
 * Handles all cube-related actions immutably.
 *
 * @param state - Current cube state
 * @param action - Action to apply
 * @returns New cube state
 */
export function cubeReducer(state: CubeState, action: CubeAction): CubeState {
  switch (action.type) {
    case 'ADD_CARD': {
      return {
        ...state,
        graph: graphAddCard(state.graph, action.payload),
      };
    }

    case 'REMOVE_CARD': {
      const newGraph = graphRemoveCard(state.graph, action.payload);
      // Clear selection if the removed card was selected
      const newSelectedCardId =
        state.selectedCardId === action.payload ? null : state.selectedCardId;
      // Clear recommendations if the selected card was removed
      const newRecommendations =
        state.selectedCardId === action.payload ? [] : state.recommendations;

      return {
        ...state,
        graph: newGraph,
        selectedCardId: newSelectedCardId,
        recommendations: newRecommendations,
      };
    }

    case 'ADD_CONNECTION': {
      const { idA, idB } = action.payload;
      return {
        ...state,
        graph: graphAddConnection(state.graph, idA, idB),
      };
    }

    case 'REMOVE_CONNECTION': {
      const { idA, idB } = action.payload;
      return {
        ...state,
        graph: graphRemoveConnection(state.graph, idA, idB),
      };
    }

    case 'SELECT_CARD': {
      // Clear recommendations when selecting a different card
      const shouldClearRecs = action.payload !== state.selectedCardId;
      return {
        ...state,
        selectedCardId: action.payload,
        recommendations: shouldClearRecs ? [] : state.recommendations,
        recsError: shouldClearRecs ? null : state.recsError,
      };
    }

    case 'SET_RECOMMENDATIONS': {
      return {
        ...state,
        recommendations: action.payload,
        isLoadingRecs: false,
        recsError: null,
      };
    }

    case 'SET_LOADING_RECS': {
      return {
        ...state,
        isLoadingRecs: action.payload,
        // Clear error when starting to load
        recsError: action.payload ? null : state.recsError,
      };
    }

    case 'SET_RECS_ERROR': {
      return {
        ...state,
        recsError: action.payload,
        isLoadingRecs: false,
      };
    }

    case 'SET_NOTIFICATION': {
      return {
        ...state,
        notification: action.payload,
      };
    }

    case 'CLEAR_NOTIFICATION': {
      // If a specific ID is provided, only clear if it matches
      if (action.payload && state.notification?.id !== action.payload) {
        return state;
      }
      return {
        ...state,
        notification: null,
      };
    }

    default: {
      // TypeScript exhaustive check
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
