/**
 * CardPanel - Displays selected card details
 *
 * Shows the card image, name, mana cost, type line, oracle text,
 * connection count, and provides buttons for removing from cube
 * and connecting to other cards.
 */

import React, { useState, useMemo } from 'react';
import { useCube } from '../../context/CubeContext';
import { getDegree, hasConnection } from '../../lib/graph';
import { ManaSymbols } from '../common/ManaSymbols';
import type { Card } from '../../types';

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '16px',
    backgroundColor: '#1a1a2e',
    borderBottom: '1px solid #2a2a4a',
  },
  emptyState: {
    padding: '24px',
    textAlign: 'center',
    color: '#888',
    fontSize: '14px',
  },
  imageContainer: {
    marginBottom: '16px',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
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
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#fff',
    margin: 0,
    flex: 1,
  },
  typeLine: {
    fontSize: '12px',
    color: '#aaa',
    marginBottom: '12px',
    fontStyle: 'italic',
  },
  oracleText: {
    fontSize: '12px',
    lineHeight: '1.5',
    color: '#ccc',
    whiteSpace: 'pre-wrap',
    marginBottom: '16px',
    padding: '12px',
    backgroundColor: '#0f0f1a',
    borderRadius: '6px',
    borderLeft: '3px solid #4a4a6a',
    maxHeight: '150px',
    overflowY: 'auto',
  },
  statsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    padding: '8px 12px',
    backgroundColor: '#2a2a4a',
    borderRadius: '6px',
  },
  connections: {
    fontSize: '13px',
    color: '#aaa',
    fontWeight: '500',
  },
  powerToughness: {
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#fff',
    backgroundColor: '#3a3a5a',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  loyalty: {
    fontSize: '13px',
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
    fontSize: '12px',
    fontWeight: '500',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s, transform 0.1s',
  },
  removeButton: {
    backgroundColor: '#4a2a2a',
    color: '#ff6b6b',
  },
  connectButton: {
    backgroundColor: '#2a3a5a',
    color: '#6b9fff',
  },
  // Connect modal styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#1a1a2e',
    borderRadius: '12px',
    padding: '20px',
    width: '90%',
    maxWidth: '400px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #2a2a4a',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  modalTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#fff',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: '24px',
    cursor: 'pointer',
    padding: '4px 8px',
    lineHeight: 1,
  },
  searchInput: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    backgroundColor: '#0f0f1a',
    border: '1px solid #3a3a5a',
    borderRadius: '6px',
    color: '#fff',
    marginBottom: '12px',
    boxSizing: 'border-box',
  },
  cardList: {
    flex: 1,
    overflowY: 'auto',
    maxHeight: '300px',
  },
  cardItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    marginBottom: '4px',
  },
  cardItemHover: {
    backgroundColor: '#2a2a4a',
  },
  cardItemConnected: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  cardThumb: {
    width: '40px',
    height: '56px',
    borderRadius: '4px',
    objectFit: 'cover',
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: '14px',
    color: '#fff',
    marginBottom: '2px',
  },
  cardType: {
    fontSize: '11px',
    color: '#888',
  },
  connectedBadge: {
    fontSize: '10px',
    color: '#6b9fff',
    backgroundColor: '#2a3a5a',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  noCards: {
    textAlign: 'center',
    color: '#888',
    padding: '20px',
    fontSize: '14px',
  },
};

export function CardPanel() {
  const { state, dispatch } = useCube();
  const { graph, selectedCardId } = state;
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

  // Get the selected card from the graph
  const selectedCard = selectedCardId ? graph.nodes.get(selectedCardId) ?? null : null;

  // Get other cards for the connect modal
  const otherCards = useMemo(() => {
    if (!selectedCardId) return [];
    const cards: Card[] = [];
    graph.nodes.forEach((card, id) => {
      if (id !== selectedCardId) {
        cards.push(card);
      }
    });
    return cards;
  }, [graph.nodes, selectedCardId]);

  // Filter cards by search query
  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return otherCards;
    const query = searchQuery.toLowerCase();
    return otherCards.filter(card =>
      card.name.toLowerCase().includes(query) ||
      card.typeLine.toLowerCase().includes(query)
    );
  }, [otherCards, searchQuery]);

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

  const handleOpenConnect = () => {
    setShowConnectModal(true);
    setSearchQuery('');
  };

  const handleCloseConnect = () => {
    setShowConnectModal(false);
    setSearchQuery('');
  };

  const handleConnect = (targetCard: Card) => {
    if (hasConnection(graph, selectedCard.oracleId, targetCard.oracleId)) {
      return; // Already connected
    }
    dispatch({
      type: 'ADD_CONNECTION',
      payload: { idA: selectedCard.oracleId, idB: targetCard.oracleId }
    });
    setShowConnectModal(false);
  };

  return (
    <>
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
            <ManaSymbols manaCost={selectedCard.manaCost} size={18} />
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
          >
            Remove
          </button>
          <button
            style={{ ...styles.button, ...styles.connectButton }}
            onClick={handleOpenConnect}
            disabled={otherCards.length === 0}
          >
            Connect to...
          </button>
        </div>
      </div>

      {/* Connect Modal */}
      {showConnectModal && (
        <div style={styles.modalOverlay} onClick={handleCloseConnect}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Connect "{selectedCard.name}" to...</h3>
              <button style={styles.closeButton} onClick={handleCloseConnect}>
                ×
              </button>
            </div>

            <input
              type="text"
              placeholder="Search cards..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={styles.searchInput}
              autoFocus
            />

            <div style={styles.cardList}>
              {filteredCards.length === 0 ? (
                <div style={styles.noCards}>
                  {otherCards.length === 0
                    ? 'Add more cards to create connections'
                    : 'No cards match your search'}
                </div>
              ) : (
                filteredCards.map(card => {
                  const isConnected = hasConnection(graph, selectedCard.oracleId, card.oracleId);
                  return (
                    <div
                      key={card.oracleId}
                      style={{
                        ...styles.cardItem,
                        ...(hoveredCardId === card.oracleId && !isConnected ? styles.cardItemHover : {}),
                        ...(isConnected ? styles.cardItemConnected : {}),
                      }}
                      onMouseEnter={() => setHoveredCardId(card.oracleId)}
                      onMouseLeave={() => setHoveredCardId(null)}
                      onClick={() => !isConnected && handleConnect(card)}
                    >
                      {card.artCropUri && (
                        <img
                          src={card.artCropUri}
                          alt={card.name}
                          style={styles.cardThumb}
                        />
                      )}
                      <div style={styles.cardInfo}>
                        <div style={styles.cardName}>{card.name}</div>
                        <div style={styles.cardType}>{card.typeLine}</div>
                      </div>
                      {isConnected && (
                        <span style={styles.connectedBadge}>Connected</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default CardPanel;
