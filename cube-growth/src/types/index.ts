/**
 * Type definitions for MTG Cube Growth Tool
 */

/**
 * Represents a unique Magic: The Gathering card in the cube.
 * Uses Scryfall's oracle_id for identity (unique per game piece).
 */
export interface Card {
  // Identity
  /** Scryfall oracle_id - unique identifier for this game piece */
  oracleId: string;
  /** Card name */
  name: string;

  // Display
  /** Card image URL (normal size) */
  imageUri: string;
  /** Art crop URL for compact display */
  artCropUri: string;

  // Metadata
  /** Mana cost string, e.g., "{2}{B}{B}" */
  manaCost: string;
  /** Converted mana cost / mana value */
  cmc: number;
  /** Card colors, e.g., ["B"] */
  colors: string[];
  /** Color identity for deck building, e.g., ["B", "G"] */
  colorIdentity: string[];
  /** Type line, e.g., "Creature - Zombie" */
  typeLine: string;
  /** Oracle rules text */
  oracleText: string;

  // Optional (creatures, planeswalkers)
  /** Power for creatures */
  power?: string;
  /** Toughness for creatures */
  toughness?: string;
  /** Starting loyalty for planeswalkers */
  loyalty?: string;
}

/**
 * The core graph data structure representing the cube.
 * Nodes are cards, edges represent synergy/relatedness between cards.
 */
export interface CubeGraph {
  /**
   * Map of oracle IDs to Card objects.
   * Each card appears exactly once in the graph.
   */
  nodes: Map<string, Card>;

  /**
   * Set of edge keys in "id1|id2" format where id1 < id2 lexicographically.
   * This ensures each undirected edge is stored once regardless of direction.
   */
  edges: Set<string>;
}

/**
 * A single contribution to a recommendation's score.
 * Tracks how a specific cube card contributed to the recommendation.
 */
export interface ScoreContribution {
  /** Name of the cube card that contributed this score */
  cardName: string;
  /** The raw lift score from EDHREC for this pairing */
  lift: number;
  /** Weight applied based on graph distance (1-10) */
  weight: number;
  /** Final contribution: lift * weight */
  contribution: number;
}

/**
 * A recommendation returned by the recommender system.
 */
export interface Recommendation {
  /** The recommended card */
  card: Card;
  /** Relevance score from 0-100 (higher = more relevant) */
  score: number;
  /** Optional explanation for why this card was recommended */
  reason?: string;
  /** True if the card already exists in the cube graph */
  alreadyInGraph: boolean;
  /** Breakdown of how each cube card contributed to the score */
  contributions?: ScoreContribution[];
}

/**
 * Creates a consistent edge key from two oracle IDs.
 * Edge keys are formatted as "id1|id2" where id1 < id2 lexicographically.
 * This ensures each undirected edge has a unique representation.
 *
 * @param idA - First oracle ID
 * @param idB - Second oracle ID
 * @returns Edge key string in canonical format
 */
export function makeEdgeKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}
