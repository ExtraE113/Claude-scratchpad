/**
 * SeedInput - Card search input with autocomplete
 *
 * Provides a text input that searches for MTG cards using Scryfall's
 * autocomplete API with debounced input. Shows a dropdown of matching
 * card names and adds selected cards to the cube.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { searchCards } from '../../lib/scryfall';
import { useCube } from '../../context/CubeContext';

const DEBOUNCE_DELAY = 300;

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    maxWidth: '400px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #ccc',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  inputFocused: {
    borderColor: '#0066cc',
    boxShadow: '0 0 0 2px rgba(0, 102, 204, 0.2)',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: '4px',
    backgroundColor: '#fff',
    border: '1px solid #ccc',
    borderRadius: '6px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    maxHeight: '300px',
    overflowY: 'auto',
    zIndex: 1000,
  },
  dropdownItem: {
    padding: '10px 12px',
    cursor: 'pointer',
    fontSize: '14px',
    borderBottom: '1px solid #eee',
    transition: 'background-color 0.15s',
  },
  dropdownItemHover: {
    backgroundColor: '#f5f5f5',
  },
  dropdownItemSelected: {
    backgroundColor: '#e6f0ff',
  },
  noResults: {
    padding: '10px 12px',
    color: '#666',
    fontStyle: 'italic',
    fontSize: '14px',
  },
  loading: {
    padding: '10px 12px',
    color: '#666',
    fontSize: '14px',
  },
};

export function SeedInput() {
  const { addCardByName, dispatch } = useCube();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const cardNames = await searchCards(query);
        setResults(cardNames);
        setIsOpen(cardNames.length > 0);
        setSelectedIndex(-1);
      } catch (error) {
        console.error('Search failed:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, DEBOUNCE_DELAY);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback(async (cardName: string) => {
    setIsAdding(true);
    setQuery('');
    setIsOpen(false);
    setResults([]);

    try {
      const { card, wasDuplicate } = await addCardByName(cardName);
      // Select the card even if it was a duplicate (to highlight it)
      dispatch({ type: 'SELECT_CARD', payload: card.oracleId });
      // If it was a duplicate, the notification is already shown by addCardByName
      if (!wasDuplicate) {
        // Card was successfully added
      }
    } catch (error) {
      console.error('Failed to add card:', error);
    }
    setIsAdding(false);
    inputRef.current?.focus();
  }, [addCardByName, dispatch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const inputStyle = {
    ...styles.input,
    ...(isFocused ? styles.inputFocused : {}),
  };

  return (
    <div style={styles.container}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          setIsFocused(true);
          if (results.length > 0) setIsOpen(true);
        }}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        placeholder={isAdding ? 'Adding card...' : 'Search for a card...'}
        disabled={isAdding}
        style={inputStyle}
        aria-label="Search for MTG cards"
        aria-autocomplete="list"
        aria-expanded={isOpen}
      />

      {isOpen && (
        <div ref={dropdownRef} style={styles.dropdown} role="listbox">
          {isLoading ? (
            <div style={styles.loading}>Searching...</div>
          ) : results.length === 0 ? (
            <div style={styles.noResults}>No cards found</div>
          ) : (
            results.map((name, index) => (
              <div
                key={name}
                role="option"
                aria-selected={index === selectedIndex}
                style={{
                  ...styles.dropdownItem,
                  ...(index === selectedIndex ? styles.dropdownItemSelected : {}),
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(name);
                }}
              >
                {name}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default SeedInput;
