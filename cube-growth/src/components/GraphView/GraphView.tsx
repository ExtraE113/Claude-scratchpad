/**
 * GraphView - D3.js force-directed graph visualization component
 * Displays the cube graph with nodes (cards) and edges (connections)
 */

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { useCube } from '../../context/CubeContext';
import { useForceSimulation, calculateNodeRadius, type SimulationNode, type SimulationEdge } from './useForceSimulation';
import { getDegree, hasConnection } from '../../lib/graph';
import type { Card } from '../../types';
import styles from './GraphView.module.css';

/** Threshold for considering a node a "hub" (high-degree card) */
const HUB_DEGREE_THRESHOLD = 3;

/**
 * Size configuration for degree-based node scaling
 */
const MIN_NODE_RADIUS = 8;
const MAX_NODE_RADIUS = 24;
const SELECTED_RADIUS_BOOST = 4; // Extra radius when selected

/**
 * State for the card preview tooltip
 */
interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  card: SimulationNode['card'] | null;
}

/**
 * State for the context menu
 */
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  nodeId: string | null;
  cardName: string;
}

/**
 * Color mapping for MTG colors
 * W=gold (white), U=blue, B=purple (black), R=red, G=green
 */
const COLOR_MAP: Record<string, string> = {
  W: '#f9d963', // White -> gold
  U: '#0e68ab', // Blue
  B: '#6c2dc7', // Black -> purple
  R: '#d32f2f', // Red
  G: '#2e7d32', // Green
};

const COLORLESS = '#9e9e9e';

/**
 * Get the display color for a card based on its colors array
 */
function getCardColor(colors: string[]): string {
  if (!colors || colors.length === 0) {
    return COLORLESS;
  }
  // Use the first color in the array
  return COLOR_MAP[colors[0]] || COLORLESS;
}

/**
 * Inline styles for context menu and connect modal
 */
const contextMenuStyles: Record<string, React.CSSProperties> = {
  menu: {
    position: 'absolute',
    backgroundColor: '#1a1a2e',
    border: '1px solid #3a3a5a',
    borderRadius: '6px',
    padding: '4px 0',
    minWidth: '150px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
    zIndex: 1000,
  },
  menuItem: {
    display: 'block',
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#fff',
    fontSize: '13px',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  menuItemHover: {
    backgroundColor: '#2a2a4a',
  },
  menuItemDanger: {
    color: '#ff6b6b',
  },
  separator: {
    height: '1px',
    backgroundColor: '#3a3a5a',
    margin: '4px 0',
  },
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

/**
 * Props for the GraphView component
 */
interface GraphViewProps {
  width?: number;
  height?: number;
}

/**
 * GraphView component - Main graph visualization
 */
export function GraphView({ width: propWidth, height: propHeight }: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const gRef = useRef<SVGGElement | null>(null);

  const { state, dispatch } = useCube();
  const { graph, selectedCardId } = state;

  // Track container dimensions
  const [dimensions, setDimensions] = useState({
    width: propWidth || 800,
    height: propHeight || 600,
  });

  // Tooltip state for card preview on hover
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    card: null,
  });

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    nodeId: null,
    cardName: '',
  });

  // Connect modal state
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [hoveredMenuItem, setHoveredMenuItem] = useState<string | null>(null);

  // Update dimensions when container resizes
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Use the force simulation hook
  const { nodes, edges, updateNodePosition, releaseNode } = useForceSimulation(graph, {
    width: dimensions.width,
    height: dimensions.height,
  });

  // Compute degree for each node to identify roots (degree 0) and hubs (high degree)
  const nodeDegrees = useMemo(() => {
    const degrees = new Map<string, number>();
    for (const node of nodes) {
      degrees.set(node.id, getDegree(graph, node.id));
    }
    return degrees;
  }, [nodes, graph]);

  // Get other cards for the connect modal
  const otherCards = useMemo(() => {
    if (!connectSourceId) return [];
    const cards: Card[] = [];
    graph.nodes.forEach((card, id) => {
      if (id !== connectSourceId) {
        cards.push(card);
      }
    });
    return cards;
  }, [graph.nodes, connectSourceId]);

  // Filter cards by search query
  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return otherCards;
    const query = searchQuery.toLowerCase();
    return otherCards.filter(card =>
      card.name.toLowerCase().includes(query) ||
      card.typeLine.toLowerCase().includes(query)
    );
  }, [otherCards, searchQuery]);

  // Handle node click - select card
  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: SimulationNode) => {
      event.stopPropagation();
      dispatch({ type: 'SELECT_CARD', payload: node.id });
    },
    [dispatch]
  );

  // Handle background click - deselect and close context menu
  const handleBackgroundClick = useCallback(() => {
    dispatch({ type: 'SELECT_CARD', payload: null });
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, [dispatch]);

  // Handle node right-click - show context menu
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: SimulationNode) => {
      event.preventDefault();
      event.stopPropagation();

      // Hide tooltip when showing context menu
      setTooltip(prev => ({ ...prev, visible: false }));

      // Get position relative to the container
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      const x = event.clientX - containerRect.left;
      const y = event.clientY - containerRect.top;

      setContextMenu({
        visible: true,
        x,
        y,
        nodeId: node.id,
        cardName: node.card.name,
      });
    },
    []
  );

  // Handle remove card from context menu
  const handleRemoveCard = useCallback(() => {
    if (contextMenu.nodeId) {
      dispatch({ type: 'REMOVE_CARD', payload: contextMenu.nodeId });
    }
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, [contextMenu.nodeId, dispatch]);

  // Handle connect to... from context menu
  const handleOpenConnectModal = useCallback(() => {
    if (contextMenu.nodeId) {
      setConnectSourceId(contextMenu.nodeId);
      setShowConnectModal(true);
      setSearchQuery('');
    }
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, [contextMenu.nodeId]);

  // Handle closing the connect modal
  const handleCloseConnectModal = useCallback(() => {
    setShowConnectModal(false);
    setConnectSourceId(null);
    setSearchQuery('');
  }, []);

  // Handle connecting to a card
  const handleConnect = useCallback((targetCard: Card) => {
    if (!connectSourceId) return;
    if (hasConnection(graph, connectSourceId, targetCard.oracleId)) {
      return; // Already connected
    }
    dispatch({
      type: 'ADD_CONNECTION',
      payload: { idA: connectSourceId, idB: targetCard.oracleId }
    });
    setShowConnectModal(false);
    setConnectSourceId(null);
  }, [connectSourceId, graph, dispatch]);

  // Handle node mouse enter - show tooltip
  const handleNodeMouseEnter = useCallback(
    (event: React.MouseEvent, node: SimulationNode) => {
      // Don't show tooltip if context menu is open
      if (contextMenu.visible) return;

      // Get position relative to the container
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      // Position tooltip near the cursor with some offset
      const x = event.clientX - containerRect.left + 15;
      const y = event.clientY - containerRect.top + 15;

      setTooltip({
        visible: true,
        x,
        y,
        card: node.card,
      });
    },
    [contextMenu.visible]
  );

  // Handle node mouse leave - hide tooltip
  const handleNodeMouseLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  // Handle node mouse move - update tooltip position
  const handleNodeMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!tooltip.visible) return;

      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      // Position tooltip near the cursor with some offset
      const x = event.clientX - containerRect.left + 15;
      const y = event.clientY - containerRect.top + 15;

      setTooltip((prev) => ({ ...prev, x, y }));
    },
    [tooltip.visible]
  );

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) {
        setContextMenu(prev => ({ ...prev, visible: false }));
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu.visible]);

  // Set up D3 zoom behavior
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);

    // Create zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        if (gRef.current) {
          d3.select(gRef.current).attr('transform', event.transform.toString());
        }
      });

    svg.call(zoom);
    zoomRef.current = zoom;

    // Initial zoom to fit
    svg.call(zoom.transform, d3.zoomIdentity);

    return () => {
      svg.on('.zoom', null);
    };
  }, []);

  // Set up drag behavior for nodes
  const createDragBehavior = useCallback(() => {
    return d3
      .drag<SVGCircleElement, SimulationNode>()
      .on('start', (event, d) => {
        if (!event.active) {
          updateNodePosition(d.id, event.x, event.y, true);
        }
      })
      .on('drag', (event, d) => {
        updateNodePosition(d.id, event.x, event.y, true);
      })
      .on('end', (event, d) => {
        if (!event.active) {
          releaseNode(d.id);
        }
      });
  }, [updateNodePosition, releaseNode]);

  // Apply drag behavior to nodes
  useEffect(() => {
    if (!svgRef.current) return;

    const nodeElements = d3.selectAll<SVGCircleElement, SimulationNode>(
      `.${styles.node}`
    );
    nodeElements.call(createDragBehavior());
  }, [nodes, createDragBehavior]);

  // Zoom control handlers
  const handleZoomIn = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(300)
        .call(zoomRef.current.scaleBy, 1.3);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(300)
        .call(zoomRef.current.scaleBy, 0.7);
    }
  }, []);

  const handleZoomReset = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(300)
        .call(zoomRef.current.transform, d3.zoomIdentity);
    }
  }, []);

  // Get edge coordinates
  const getEdgeCoords = (edge: SimulationEdge) => {
    const source = edge.source as SimulationNode;
    const target = edge.target as SimulationNode;
    return {
      x1: source.x || 0,
      y1: source.y || 0,
      x2: target.x || 0,
      y2: target.y || 0,
    };
  };

  // Get source card name for modal title
  const sourceCardName = connectSourceId ? graph.nodes.get(connectSourceId)?.name ?? '' : '';

  // Empty state
  if (graph.nodes.size === 0) {
    return (
      <div ref={containerRef} className={styles.container}>
        <div className={styles.emptyState}>
          Add cards to start building your cube graph
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={styles.container}>
      <svg
        ref={svgRef}
        className={styles.svg}
        width={dimensions.width}
        height={dimensions.height}
        onClick={handleBackgroundClick}
      >
        <g ref={(el) => { gRef.current = el; }}>
          {/* Render edges */}
          {edges.map((edge, index) => {
            const coords = getEdgeCoords(edge);
            const source = edge.source as SimulationNode;
            const target = edge.target as SimulationNode;
            const key = `${source.id}-${target.id}-${index}`;
            return (
              <line
                key={key}
                className={styles.edge}
                x1={coords.x1}
                y1={coords.y1}
                x2={coords.x2}
                y2={coords.y2}
              />
            );
          })}

          {/* Render nodes */}
          {nodes.map((node) => {
            const isSelected = node.id === selectedCardId;
            const color = getCardColor(node.card.colors);
            const degree = nodeDegrees.get(node.id) ?? 0;
            // Calculate radius based on degree - hubs appear larger
            const baseRadius = calculateNodeRadius(degree, MIN_NODE_RADIUS, MAX_NODE_RADIUS);
            const radius = isSelected ? baseRadius + SELECTED_RADIUS_BOOST : baseRadius;
            const isRoot = degree === 0;
            const isHub = degree >= HUB_DEGREE_THRESHOLD;

            // Build class list for node
            const nodeClasses = [
              styles.node,
              isSelected ? styles.nodeSelected : '',
              isRoot ? styles.rootNode : '',
              isHub ? styles.hubNode : '',
            ].filter(Boolean).join(' ');

            return (
              <g key={node.id}>
                <circle
                  className={nodeClasses}
                  cx={node.x}
                  cy={node.y}
                  r={radius}
                  fill={color}
                  stroke={isSelected ? '#ffffff' : color}
                  strokeWidth={isSelected ? 3 : 1.5}
                  strokeDasharray={isRoot ? '4 2' : undefined}
                  onClick={(e) => handleNodeClick(e, node)}
                  onContextMenu={(e) => handleNodeContextMenu(e, node)}
                  onMouseEnter={(e) => handleNodeMouseEnter(e, node)}
                  onMouseMove={handleNodeMouseMove}
                  onMouseLeave={handleNodeMouseLeave}
                />
              </g>
            );
          })}
        </g>
      </svg>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          style={{
            ...contextMenuStyles.menu,
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            style={{
              ...contextMenuStyles.menuItem,
              ...(hoveredMenuItem === 'connect' ? contextMenuStyles.menuItemHover : {}),
            }}
            onMouseEnter={() => setHoveredMenuItem('connect')}
            onMouseLeave={() => setHoveredMenuItem(null)}
            onClick={handleOpenConnectModal}
          >
            Connect to...
          </button>
          <div style={contextMenuStyles.separator} />
          <button
            style={{
              ...contextMenuStyles.menuItem,
              ...contextMenuStyles.menuItemDanger,
              ...(hoveredMenuItem === 'remove' ? contextMenuStyles.menuItemHover : {}),
            }}
            onMouseEnter={() => setHoveredMenuItem('remove')}
            onMouseLeave={() => setHoveredMenuItem(null)}
            onClick={handleRemoveCard}
          >
            Remove card
          </button>
        </div>
      )}

      {/* Connect Modal */}
      {showConnectModal && (
        <div style={contextMenuStyles.modalOverlay} onClick={handleCloseConnectModal}>
          <div style={contextMenuStyles.modal} onClick={e => e.stopPropagation()}>
            <div style={contextMenuStyles.modalHeader}>
              <h3 style={contextMenuStyles.modalTitle}>Connect "{sourceCardName}" to...</h3>
              <button style={contextMenuStyles.closeButton} onClick={handleCloseConnectModal}>
                x
              </button>
            </div>

            <input
              type="text"
              placeholder="Search cards..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={contextMenuStyles.searchInput}
              autoFocus
            />

            <div style={contextMenuStyles.cardList}>
              {filteredCards.length === 0 ? (
                <div style={contextMenuStyles.noCards}>
                  {otherCards.length === 0
                    ? 'Add more cards to create connections'
                    : 'No cards match your search'}
                </div>
              ) : (
                filteredCards.map(card => {
                  const isConnected = connectSourceId ? hasConnection(graph, connectSourceId, card.oracleId) : false;
                  return (
                    <div
                      key={card.oracleId}
                      style={{
                        ...contextMenuStyles.cardItem,
                        ...(hoveredCardId === card.oracleId && !isConnected ? contextMenuStyles.cardItemHover : {}),
                        ...(isConnected ? contextMenuStyles.cardItemConnected : {}),
                      }}
                      onMouseEnter={() => setHoveredCardId(card.oracleId)}
                      onMouseLeave={() => setHoveredCardId(null)}
                      onClick={() => !isConnected && handleConnect(card)}
                    >
                      {card.artCropUri && (
                        <img
                          src={card.artCropUri}
                          alt={card.name}
                          style={contextMenuStyles.cardThumb}
                        />
                      )}
                      <div style={contextMenuStyles.cardInfo}>
                        <div style={contextMenuStyles.cardName}>{card.name}</div>
                        <div style={contextMenuStyles.cardType}>{card.typeLine}</div>
                      </div>
                      {isConnected && (
                        <span style={contextMenuStyles.connectedBadge}>Connected</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className={styles.zoomControls}>
        <button
          className={styles.zoomButton}
          onClick={handleZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          className={styles.zoomButton}
          onClick={handleZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
        >
          -
        </button>
        <button
          className={styles.zoomButton}
          onClick={handleZoomReset}
          title="Reset zoom"
          aria-label="Reset zoom"
        >
          R
        </button>
      </div>

      {/* Card preview tooltip */}
      {tooltip.visible && tooltip.card && (
        <div
          className={styles.cardTooltip}
          style={{
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          <img
            src={tooltip.card.artCropUri || tooltip.card.imageUri}
            alt={tooltip.card.name}
            className={styles.cardTooltipImage}
          />
          <div className={styles.cardTooltipName}>{tooltip.card.name}</div>
        </div>
      )}
    </div>
  );
}

export default GraphView;
