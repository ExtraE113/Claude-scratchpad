/**
 * ManaSymbols - Renders mana cost strings as colored symbols
 *
 * Parses mana cost strings like "{2}{W}{U}" and renders them as
 * colored circles representing each mana symbol.
 */

import React from 'react';

interface ManaSymbolsProps {
  manaCost: string;
  size?: number;
}

/**
 * Color mapping for mana symbols
 */
const MANA_COLORS: Record<string, { bg: string; text: string }> = {
  W: { bg: '#F9FAF4', text: '#C9B98E' },  // White
  U: { bg: '#0E68AB', text: '#FFFFFF' },  // Blue
  B: { bg: '#150B00', text: '#BEB9B2' },  // Black
  R: { bg: '#D3202A', text: '#FFFFFF' },  // Red
  G: { bg: '#00733E', text: '#FFFFFF' },  // Green
  C: { bg: '#CBC5C0', text: '#000000' },  // Colorless
  X: { bg: '#CBC5C0', text: '#000000' },  // X cost
  S: { bg: '#CBC5C0', text: '#7B5DAA' },  // Snow
  P: { bg: '#CBC5C0', text: '#B5405A' },  // Phyrexian
};

/**
 * Parses a mana cost string into individual symbols
 * @param manaCost - Mana cost string like "{2}{W}{U}"
 * @returns Array of mana symbol strings
 */
function parseManaSymbols(manaCost: string): string[] {
  const symbols: string[] = [];
  const regex = /\{([^}]+)\}/g;
  let match;

  while ((match = regex.exec(manaCost)) !== null) {
    symbols.push(match[1]);
  }

  return symbols;
}

/**
 * Gets the display text for a mana symbol
 */
function getSymbolText(symbol: string): string {
  // Handle hybrid mana (e.g., "W/U")
  if (symbol.includes('/')) {
    return symbol.split('/').join('');
  }
  // Handle phyrexian mana (e.g., "W/P" or "P/W")
  if (symbol.includes('P')) {
    return symbol.replace('/P', '').replace('P/', '').replace('P', 'P');
  }
  return symbol;
}

/**
 * Gets the colors for a mana symbol
 */
function getSymbolColors(symbol: string): { bg: string; text: string } {
  // Handle hybrid mana
  if (symbol.includes('/')) {
    const parts = symbol.split('/');
    const firstColor = parts[0];
    if (MANA_COLORS[firstColor]) {
      return MANA_COLORS[firstColor];
    }
  }

  // Check if it's a named color
  const upperSymbol = symbol.toUpperCase();
  if (MANA_COLORS[upperSymbol]) {
    return MANA_COLORS[upperSymbol];
  }

  // Default for numbers and unknown symbols
  return { bg: '#CBC5C0', text: '#000000' };
}

const containerStyle: React.CSSProperties = {
  display: 'inline-flex',
  flexWrap: 'wrap',
  gap: '2px',
  alignItems: 'center',
};

export function ManaSymbols({ manaCost, size = 18 }: ManaSymbolsProps) {
  const symbols = parseManaSymbols(manaCost);

  if (symbols.length === 0) {
    return null;
  }

  const symbolStyle = (colors: { bg: string; text: string }): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    borderRadius: '50%',
    backgroundColor: colors.bg,
    color: colors.text,
    fontSize: size * 0.55,
    fontWeight: 'bold',
    border: '1px solid rgba(0, 0, 0, 0.2)',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
  });

  return (
    <span style={containerStyle}>
      {symbols.map((symbol, index) => {
        const colors = getSymbolColors(symbol);
        const text = getSymbolText(symbol);

        return (
          <span key={index} style={symbolStyle(colors)} title={`{${symbol}}`}>
            {text}
          </span>
        );
      })}
    </span>
  );
}

export default ManaSymbols;
