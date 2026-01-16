/**
 * CardPanel - Displays selected card details
 *
 * Shows the card image, name, mana cost, type line, oracle text,
 * connection count, and provides buttons for removing from cube
 * and connecting to other cards.
 */

import React from 'react';
import { useCube } from '../../context/CubeContext';
import { getDegree } from '../../lib/graph';
import { ManaSymbols } from '../common/ManaSymbols';

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '16px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    maxWidth: '320px',
  },
  emptyState: {
    padding: '24px',
    textAlign: 'center',
    color: '#666',
    fontSize: '14px',
    backgroundColor: '#f9f9f9',
    borderRadius: '8px',
    border: '2px dashed #ddd',
  },
  imageContainer: {
    marginBottom: '16px',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  },
  image: {
    width: '100%',
    display: 'block',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '8px',
    gap: '8px',
  },
  name: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#333',
    margin: 0,
    flex: 1,
  },
  typeLine: {
    fontSize: '13px',
    color: '#666',
    marginBottom: '12px',
    fontStyle: 'italic',
  },
  oracleText: {
    fontSize: '13px',
    lineHeight: '1.5',
    color: '#444',
    whiteSpace: 'pre-wrap',
    marginBottom: '16px',
    padding: '12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '6px',
    borderLeft: '3px solid #ccc',
    maxHeight: '200px',
    overflowY: 'auto',
  },
  statsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    padding: '8px 12px',
    backgroundColor: '#f0f0f0',
    borderRadius: '6px',
  },
  connections: {
    fontSize: '14px',
    color: '#555',
    fontWeight: '500',
  },
  powerToughness: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#333',
    backgroundColor: '#fff',
    padding: '4px 8px',
    borderRadius: '4px',
    border: '1px solid #ddd',
  },
  loyalty: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#fff',
    backgroundColor: '#6b46c1',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  buttonRow: {
    display: 'flex',
    gap: '8px',
  },
  button: {
    flex: 1,
    padding: '10px 12px',
    fontSize: '13px',
    fontWeight: '500',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s, transform 0.1s',
  },
  removeButton: {
    backgroundColor: '#fee2e2',
    color: '#dc2626',
  },
  connectButton: {
    backgroundColor: '#dbeafe',
    color: '#2563eb',
  },
};

export function CardPanel() {
  const { state, dispatch } = useCube();
  const { graph, selectedCardId } = state;

  // Get the selected card from the graph
  const selectedCard = selectedCardId ? graph.nodes.get(selectedCardId) ?? null : null;

  if (!selectedCard) {
    return (
      <div style={styles.emptyState}>
        Select a card to view its details
      </div>
    );
  }

  const degree = getDegree(graph, selectedCard.oracleId);

  const handleRemove = () => {
    dispatch({ type: 'REMOVE_CARD', payload: selectedCard.oracleId });
  };

  const handleConnect = () => {
    // Placeholder for connect functionality
    console.log('Connect to... clicked for:', selectedCard.name);
  };

  return (
    <div style={styles.container}>
      {/* Card Image */}
      {selectedCard.imageUri && (
        <div style={styles.imageContainer}>
          <img
            src={selectedCard.imageUri}
            alt={selectedCard.name}
            style={styles.image}
            loading="lazy"
          />
        </div>
      )}

      {/* Header with Name and Mana Cost */}
      <div style={styles.header}>
        <h2 style={styles.name}>{selectedCard.name}</h2>
        {selectedCard.manaCost && (
          <ManaSymbols manaCost={selectedCard.manaCost} size={20} />
        )}
      </div>

      {/* Type Line */}
      <div style={styles.typeLine}>{selectedCard.typeLine}</div>

      {/* Oracle Text */}
      {selectedCard.oracleText && (
        <div style={styles.oracleText}>{selectedCard.oracleText}</div>
      )}

      {/* Stats Row */}
      <div style={styles.statsRow}>
        <span style={styles.connections}>Connections: {degree}</span>
        {selectedCard.power && selectedCard.toughness && (
          <span style={styles.powerToughness}>
            {selectedCard.power}/{selectedCard.toughness}
          </span>
        )}
        {selectedCard.loyalty && (
          <span style={styles.loyalty}>{selectedCard.loyalty}</span>
        )}
      </div>

      {/* Action Buttons */}
      <div style={styles.buttonRow}>
        <button
          style={{ ...styles.button, ...styles.removeButton }}
          onClick={handleRemove}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = '#fecaca';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = '#fee2e2';
          }}
        >
          Remove from cube
        </button>
        <button
          style={{ ...styles.button, ...styles.connectButton }}
          onClick={handleConnect}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = '#bfdbfe';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = '#dbeafe';
          }}
        >
          Connect to...
        </button>
      </div>
    </div>
  );
}

export default CardPanel;
