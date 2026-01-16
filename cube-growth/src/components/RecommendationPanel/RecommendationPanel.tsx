/**
 * RecommendationPanel - Displays card recommendations with image-focused design
 *
 * Shows recommendations as a grid of full card images with overlay info.
 * Cards are the primary UI element with details shown on hover.
 */

import { useCube } from '../../context/CubeContext';
import type { Recommendation } from '../../types';
import './RecommendationPanel.css';

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
    <div className="rec-card">
      <div className="rec-card-image-wrapper">
        {card.imageUri ? (
          <img
            src={card.imageUri}
            alt={card.name}
            className="rec-card-image"
            loading="lazy"
          />
        ) : (
          <div className="rec-card-placeholder">
            <span>?</span>
          </div>
        )}

        {/* Badges */}
        <div className="rec-card-score-badge">
          {score.toFixed(0)}
        </div>
        {alreadyInGraph && (
          <div className="rec-card-in-cube-badge">In Cube</div>
        )}

        {/* Hover overlay */}
        <div className="rec-card-overlay">
          <div className="rec-card-name">{card.name}</div>
          <div className="rec-card-score-bar">
            <div
              className="rec-card-score-fill"
              style={{ width: `${scorePercent}%` }}
            />
          </div>
          <div className="rec-card-actions">
            {alreadyInGraph ? (
              <button
                className="rec-action-btn rec-action-connect"
                onClick={(e) => {
                  e.stopPropagation();
                  onConnect(recommendation);
                }}
              >
                Add Connection
              </button>
            ) : (
              <>
                <button
                  className="rec-action-btn rec-action-add"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdd(recommendation);
                  }}
                >
                  Add
                </button>
                <button
                  className="rec-action-btn rec-action-add-connect"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddAndConnect(recommendation);
                  }}
                >
                  Add + Connect
                </button>
              </>
            )}
          </div>
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
      const { card, wasDuplicate } = await addCardByName(recommendation.card.name);
      if (!wasDuplicate) {
        dispatch({
          type: 'ADD_CONNECTION',
          payload: { idA: selectedCardId, idB: card.oracleId },
        });
      }
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

  return (
    <div className="rec-panel">
      {/* Header */}
      <div className="rec-panel-header">
        <h2 className="rec-panel-title">Suggested Cards</h2>
        {selectedCardId && (
          <button
            className={`rec-fetch-btn ${isLoadingRecs ? 'disabled' : ''}`}
            onClick={handleFetch}
            disabled={isLoadingRecs}
          >
            {isLoadingRecs ? 'Loading...' : 'Fetch'}
          </button>
        )}
      </div>

      {/* Count badge */}
      {recommendations.length > 0 && (
        <div className="rec-count-badge">{recommendations.length} suggestions</div>
      )}

      {/* Content */}
      <div className="rec-panel-content">
        {/* No card selected */}
        {!selectedCardId && (
          <div className="rec-empty-state">
            <div className="rec-empty-icon">🎴</div>
            <p>Select a card to see recommendations</p>
          </div>
        )}

        {/* Error State */}
        {recsError && (
          <div className="rec-error">
            <div className="rec-error-text">{recsError}</div>
            <button className="rec-retry-btn" onClick={handleFetch}>
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoadingRecs && (
          <div className="rec-loading">
            <div className="rec-spinner" />
            <span>Finding suggestions...</span>
          </div>
        )}

        {/* Empty State - card selected but no recommendations yet */}
        {selectedCardId && !isLoadingRecs && !recsError && recommendations.length === 0 && (
          <div className="rec-empty-state">
            <div className="rec-empty-icon">✨</div>
            <p>Click "Fetch" to discover card suggestions</p>
          </div>
        )}

        {/* Recommendations Grid */}
        {!isLoadingRecs && recommendations.length > 0 && (
          <div className="rec-cards-grid">
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
    </div>
  );
}

export default RecommendationPanel;
