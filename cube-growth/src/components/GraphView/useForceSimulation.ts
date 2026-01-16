/**
 * Custom hook for D3 force simulation
 * Manages the physics simulation for the graph visualization
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import type { CubeGraph, Card } from '../../types';
import { getDegree } from '../../lib/graph';

/**
 * Node data for the force simulation
 */
export interface SimulationNode extends d3.SimulationNodeDatum {
  id: string;
  card: Card;
  x: number;
  y: number;
  fx?: number | null;
  fy?: number | null;
  /** The degree (number of connections) of this node */
  degree: number;
}

/**
 * Edge data for the force simulation
 */
export interface SimulationEdge extends d3.SimulationLinkDatum<SimulationNode> {
  source: SimulationNode | string;
  target: SimulationNode | string;
}

/**
 * Return type for the hook
 */
export interface ForceSimulationResult {
  nodes: SimulationNode[];
  edges: SimulationEdge[];
  updateNodePosition: (nodeId: string, x: number, y: number, fixed: boolean) => void;
  releaseNode: (nodeId: string) => void;
}

/**
 * Configuration options for the force simulation
 */
interface ForceSimulationOptions {
  width: number;
  height: number;
  linkDistance?: number;
  chargeStrength?: number;
  /** Base collision radius (minimum radius) */
  minNodeRadius?: number;
  /** Maximum node radius for high-degree nodes */
  maxNodeRadius?: number;
}

/**
 * Constants for node size calculation
 */
const DEFAULT_MIN_RADIUS = 8;
const DEFAULT_MAX_RADIUS = 24;
const COLLISION_PADDING = 4; // Extra padding around nodes for collision detection

/**
 * Calculate the radius of a node based on its degree.
 * Uses a square root scale to prevent very high degree nodes from becoming too large.
 *
 * @param degree - The number of connections the node has
 * @param minRadius - Minimum node radius
 * @param maxRadius - Maximum node radius
 * @returns The calculated radius for the node
 */
export function calculateNodeRadius(
  degree: number,
  minRadius: number = DEFAULT_MIN_RADIUS,
  maxRadius: number = DEFAULT_MAX_RADIUS
): number {
  if (degree === 0) {
    return minRadius;
  }
  // Use square root scaling for a more gradual increase
  // This maps degree 1 -> minRadius, and higher degrees scale up to maxRadius
  const scaleFactor = Math.sqrt(degree);
  const radiusRange = maxRadius - minRadius;
  // Cap at maxRadius (around degree 16+ will hit max with sqrt scaling)
  const radius = minRadius + Math.min(scaleFactor * (radiusRange / 4), radiusRange);
  return radius;
}

/**
 * Custom hook for managing D3 force simulation
 */
export function useForceSimulation(
  graph: CubeGraph,
  options: ForceSimulationOptions
): ForceSimulationResult {
  const {
    width,
    height,
    linkDistance = 100,
    chargeStrength = -300,
    minNodeRadius = DEFAULT_MIN_RADIUS,
    maxNodeRadius = DEFAULT_MAX_RADIUS,
  } = options;

  const simulationRef = useRef<d3.Simulation<SimulationNode, SimulationEdge> | null>(null);
  const nodesMapRef = useRef<Map<string, SimulationNode>>(new Map());

  const [nodes, setNodes] = useState<SimulationNode[]>([]);
  const [edges, setEdges] = useState<SimulationEdge[]>([]);

  // Convert graph to simulation data
  useEffect(() => {
    // Build new nodes, preserving positions of existing nodes
    const newNodesMap = new Map<string, SimulationNode>();

    graph.nodes.forEach((card, oracleId) => {
      const existingNode = nodesMapRef.current.get(oracleId);
      const degree = getDegree(graph, oracleId);

      if (existingNode) {
        // Preserve existing node position, update degree
        newNodesMap.set(oracleId, {
          ...existingNode,
          card,
          degree,
        });
      } else {
        // Create new node with random position near center
        const angle = Math.random() * 2 * Math.PI;
        const radius = Math.random() * 50;
        newNodesMap.set(oracleId, {
          id: oracleId,
          card,
          x: width / 2 + Math.cos(angle) * radius,
          y: height / 2 + Math.sin(angle) * radius,
          degree,
        });
      }
    });

    // Build edges
    const newEdges: SimulationEdge[] = [];
    graph.edges.forEach((edgeKey) => {
      const [sourceId, targetId] = edgeKey.split('|');
      if (newNodesMap.has(sourceId) && newNodesMap.has(targetId)) {
        newEdges.push({
          source: sourceId,
          target: targetId,
        });
      }
    });

    const newNodes = Array.from(newNodesMap.values());
    nodesMapRef.current = newNodesMap;

    // Update or create simulation
    if (simulationRef.current) {
      // Update existing simulation
      simulationRef.current.nodes(newNodes);

      const linkForce = simulationRef.current.force('link') as d3.ForceLink<
        SimulationNode,
        SimulationEdge
      >;
      if (linkForce) {
        linkForce.links(newEdges);
      }

      // Update collision force to account for degree changes
      const collisionForce = d3.forceCollide<SimulationNode>().radius((d) => {
        return calculateNodeRadius(d.degree, minNodeRadius, maxNodeRadius) + COLLISION_PADDING;
      });
      simulationRef.current.force('collision', collisionForce);

      // Reheat the simulation
      simulationRef.current.alpha(0.3).restart();
    } else {
      // Create collision force with degree-based radius
      const collisionForce = d3.forceCollide<SimulationNode>().radius((d) => {
        return calculateNodeRadius(d.degree, minNodeRadius, maxNodeRadius) + COLLISION_PADDING;
      });

      // Create new simulation
      const simulation = d3
        .forceSimulation<SimulationNode, SimulationEdge>(newNodes)
        .force(
          'link',
          d3
            .forceLink<SimulationNode, SimulationEdge>(newEdges)
            .id((d) => d.id)
            .distance(linkDistance)
        )
        .force('charge', d3.forceManyBody().strength(chargeStrength))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', collisionForce)
        .on('tick', () => {
          // Update state on each tick
          setNodes([...simulation.nodes()]);
          setEdges([...(simulation.force('link') as d3.ForceLink<SimulationNode, SimulationEdge>).links()]);
        });

      simulationRef.current = simulation;
    }

    // Cleanup on unmount
    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
    };
  }, [graph, width, height, linkDistance, chargeStrength, minNodeRadius, maxNodeRadius]);

  // Update simulation center when dimensions change
  useEffect(() => {
    if (simulationRef.current) {
      simulationRef.current.force('center', d3.forceCenter(width / 2, height / 2));
      simulationRef.current.alpha(0.1).restart();
    }
  }, [width, height]);

  // Function to update a node's position (for dragging)
  const updateNodePosition = useCallback(
    (nodeId: string, x: number, y: number, fixed: boolean) => {
      const node = nodesMapRef.current.get(nodeId);
      if (node && simulationRef.current) {
        node.x = x;
        node.y = y;
        if (fixed) {
          node.fx = x;
          node.fy = y;
        }
        simulationRef.current.alpha(0.3).restart();
      }
    },
    []
  );

  // Function to release a node (stop fixing its position)
  const releaseNode = useCallback((nodeId: string) => {
    const node = nodesMapRef.current.get(nodeId);
    if (node) {
      node.fx = null;
      node.fy = null;
    }
  }, []);

  return {
    nodes,
    edges,
    updateNodePosition,
    releaseNode,
  };
}
