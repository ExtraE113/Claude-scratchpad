/**
 * RecommendationPanel - Displays card recommendations
 *
 * Shows recommendations for the currently selected card with options
 * to add cards to the cube and create connections.
 */

import React from 'react';
import { useCube } from '../../context/CubeContext';
import type { Recommendation } from '../../types';

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '16px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    maxWidth: '400px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#333',
    margin: 0,
  },
  fetchButton: {
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '500',
    backgroundColor: '#10b981',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  fetchButtonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  },
  emptyState: {
    padding: '24px',
    textAlign: 'center',
    color: '#666',
    fontSize: '14px',
    backgroundColor: '#f9f9f9',
    borderRadius: '6px',
    border: '2px dashed #ddd',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '32px',
    gap: '12px',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #e5e7eb',
    borderTopColor: '#3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    color: '#666',
    fontSize: '14px',
  },
  errorContainer: {
    padding: '16px',
    backgroundColor: '#fef2f2',
    borderRadius: '6px',
    border: '1px solid #fecaca',
    marginBottom: '12px',
  },
  errorText: {
    color: '#dc2626',
    fontSize: '13px',
    marginBottom: '8px',
  },
  retryButton: {
    padding: '6px 12px',
    fontSize: '12px',
    backgroundColor: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxHeight: '500px',
    overflowY: 'auto',
  },
  item: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    transition: 'border-color 0.2s',
  },
  itemHover: {
    borderColor: '#3b82f6',
  },
  thumbnail: {
    width: '60px',
    height: '84px',
    borderRadius: '4px',
    objectFit: 'cover',
    flexShrink: 0,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  itemContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: 0,
  },
  itemName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
    margin: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  itemScore: {
    fontSize: '12px',
    color: '#666',
  },
  scoreBar: {
    width: '100%',
    height: '4px',
    backgroundColor: '#e5e7eb',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: '2px',
  },
  itemButtons: {
    display: 'flex',
    gap: '6px',
    marginTop: 'auto',
  },
  itemButton: {
    padding: '6px 10px',
    fontSize: '11px',
    fontWeight: '500',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  addButton: {
    backgroundColor: '#dbeafe',
    color: '#2563eb',
  },
  addConnectButton: {
    backgroundColor: '#d1fae5',
    color: '#059669',
  },
  connectOnlyButton: {
    backgroundColor: '#fef3c7',
    color: '#d97706',
  },
  inGraphBadge: {
    fontSize: '10px',
    color: '#059669',
    backgroundColor: '#d1fae5',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: '500',
  },
};

// Inline keyframes for spinner animation
const spinnerKeyframes = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

interface RecommendationItemProps {
  recommendation: Recommendation;
  onAdd: (recommendation: Recommendation) => void;
  onAddAndConnect: (recommendation: Recommendation) => void;
  onConnect: (recommendation: Recommendation) => void;
}

function RecommendationItem({
  recommendation,
  onAdd,
  onAddAndConnect,
  onConnect,
}: RecommendationItemProps) {
  const { card, score, alreadyInGraph } = recommendation;
  const scorePercent = Math.min(100, Math.max(0, score));

  return (
    <div style={styles.item}>
      {/* Thumbnail */}
      {card.artCropUri ? (
        <img
          src={card.artCropUri}
          alt={card.name}
          style={styles.thumbnail}
          loading="lazy"
        />
      ) : (
        <div
          style={{
            ...styles.thumbnail,
            backgroundColor: '#e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ?
        </div>
      )}

      {/* Content */}
      <div style={styles.itemContent}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h4 style={styles.itemName} title={card.name}>
            {card.name}
          </h4>
          {alreadyInGraph && <span style={styles.inGraphBadge}>In Cube</span>}
        </div>

        <div style={styles.itemScore}>Score: {score.toFixed(1)}</div>

        <div style={styles.scoreBar}>
          <div
            style={{
              ...styles.scoreBarFill,
              width: `${scorePercent}%`,
            }}
          />
        </div>

        {/* Action Buttons */}
        <div style={styles.itemButtons}>
          {alreadyInGraph ? (
            <button
              style={{ ...styles.itemButton, ...styles.connectOnlyButton }}
              onClick={() => onConnect(recommendation)}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#fde68a';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = '#fef3c7';
              }}
            >
              Add Connection
            </button>
          ) : (
            <>
              <button
                style={{ ...styles.itemButton, ...styles.addButton }}
                onClick={() => onAdd(recommendation)}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#bfdbfe';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#dbeafe';
                }}
              >
                Add
              </button>
              <button
                style={{ ...styles.itemButton, ...styles.addConnectButton }}
                onClick={() => onAddAndConnect(recommendation)}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#a7f3d0';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#d1fae5';
                }}
              >
                Add + Connect
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function RecommendationPanel() {
  const { state, dispatch, addCardByName, fetchRecommendationsForSelected } = useCube();
  const { selectedCardId, recommendations, isLoadingRecs, recsError } = state;

  const handleFetch = async () => {
    await fetchRecommendationsForSelected();
  };

  const handleAdd = async (recommendation: Recommendation) => {
    try {
      await addCardByName(recommendation.card.name);
    } catch (error) {
      console.error('Failed to add card:', error);
    }
  };

  const handleAddAndConnect = async (recommendation: Recommendation) => {
    if (!selectedCardId) return;

    try {
      const card = await addCardByName(recommendation.card.name);
      dispatch({
        type: 'ADD_CONNECTION',
        payload: { idA: selectedCardId, idB: card.oracleId },
      });
    } catch (error) {
      console.error('Failed to add card and connect:', error);
    }
  };

  const handleConnect = (recommendation: Recommendation) => {
    if (!selectedCardId) return;

    dispatch({
      type: 'ADD_CONNECTION',
      payload: { idA: selectedCardId, idB: recommendation.card.oracleId },
    });
  };

  // No card selected
  if (!selectedCardId) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          Select a card to see recommendations
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Inject spinner animation */}
      <style>{spinnerKeyframes}</style>

      {/* Header */}
      <div style={styles.header}>
        <h3 style={styles.title}>Recommendations</h3>
        <button
          style={{
            ...styles.fetchButton,
            ...(isLoadingRecs ? styles.fetchButtonDisabled : {}),
          }}
          onClick={handleFetch}
          disabled={isLoadingRecs}
          onMouseOver={(e) => {
            if (!isLoadingRecs) {
              e.currentTarget.style.backgroundColor = '#059669';
            }
          }}
          onMouseOut={(e) => {
            if (!isLoadingRecs) {
              e.currentTarget.style.backgroundColor = '#10b981';
            }
          }}
        >
          {isLoadingRecs ? 'Loading...' : 'Fetch'}
        </button>
      </div>

      {/* Error State */}
      {recsError && (
        <div style={styles.errorContainer}>
          <div style={styles.errorText}>{recsError}</div>
          <button style={styles.retryButton} onClick={handleFetch}>
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoadingRecs && (
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <span style={styles.loadingText}>Fetching recommendations...</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoadingRecs && !recsError && recommendations.length === 0 && (
        <div style={styles.emptyState}>
          Click "Fetch" to get card recommendations
        </div>
      )}

      {/* Recommendations List */}
      {!isLoadingRecs && recommendations.length > 0 && (
        <div style={styles.list}>
          {recommendations.map((rec) => (
            <RecommendationItem
              key={rec.card.oracleId}
              recommendation={rec}
              onAdd={handleAdd}
              onAddAndConnect={handleAddAndConnect}
              onConnect={handleConnect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default RecommendationPanel;
