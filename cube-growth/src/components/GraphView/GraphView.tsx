/**
 * GraphView - D3.js force-directed graph visualization component
 * Displays the cube graph with nodes (cards) and edges (connections)
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { useCube } from '../../context/CubeContext';
import { useForceSimulation, type SimulationNode, type SimulationEdge } from './useForceSimulation';
import styles from './GraphView.module.css';

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

  // Handle node click - select card
  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: SimulationNode) => {
      event.stopPropagation();
      dispatch({ type: 'SELECT_CARD', payload: node.id });
    },
    [dispatch]
  );

  // Handle background click - deselect
  const handleBackgroundClick = useCallback(() => {
    dispatch({ type: 'SELECT_CARD', payload: null });
  }, [dispatch]);

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
            const radius = isSelected ? 14 : 10;

            return (
              <g key={node.id}>
                <circle
                  className={`${styles.node} ${isSelected ? styles.nodeSelected : ''}`}
                  cx={node.x}
                  cy={node.y}
                  r={radius}
                  fill={color}
                  stroke={isSelected ? '#ffffff' : color}
                  strokeWidth={isSelected ? 3 : 1.5}
                  onClick={(e) => handleNodeClick(e, node)}
                >
                  <title>{node.card.name}</title>
                </circle>
              </g>
            );
          })}
        </g>
      </svg>

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
    </div>
  );
}

export default GraphView;
