/**
 * Commander-only card filter
 *
 * Filters out cards that are specific to Commander format and not suitable
 * for cube construction.
 */

/**
 * Set of card names that are Commander-specific and should be filtered
 * from recommendations.
 */
export const COMMANDER_ONLY_CARDS: Set<string> = new Set([
  "Command Tower",
  "Arcane Signet",
  "Commander's Sphere",
  "Command Beacon",
  "Opal Palace",
  "Path of Ancestry",
  "Commander's Plate",
  "Jeweled Lotus",
  "Fierce Guardianship",
  "Deflecting Swat",
  "Deadly Rollick",
  "Flawless Maneuver",
  "Obscuring Haze",
  "Dockside Extortionist",
  "Jeska's Will",
  "Hullbreacher",
  "Opposition Agent",
  "War Room",
  "Arcane Lighthouse",
  "Sanctum of Eternity",
  "Homeward Path",
  "Tyrite Sanctum",
]);

/**
 * Patterns that indicate a card references the commander zone or commander mechanics.
 */
const COMMANDER_TEXT_PATTERNS: RegExp[] = [
  /\bcommander\b/i,
  /\bcommand zone\b/i,
];

/**
 * Checks if a card is Commander-only and should be filtered from recommendations.
 *
 * @param name - The card name to check
 * @param oracleText - Optional oracle text to check for commander keywords
 * @returns true if the card is Commander-only and should be filtered
 */
export function isCommanderOnlyCard(name: string, oracleText?: string): boolean {
  // Check if the card name is in the known Commander-only set
  if (COMMANDER_ONLY_CARDS.has(name)) {
    return true;
  }

  // Check if the oracle text contains commander-specific keywords
  if (oracleText) {
    return COMMANDER_TEXT_PATTERNS.some((pattern) => pattern.test(oracleText));
  }

  return false;
}
