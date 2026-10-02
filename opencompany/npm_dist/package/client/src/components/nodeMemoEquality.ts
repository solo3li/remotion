/**
 * Shared `React.memo` equality function for React Flow custom node
 * components. Compares only the props that affect the rendered output
 * — `xPos` / `yPos` / `dragging` change on every drag tick but the
 * visual positioning is handled by React Flow's transform layer, not
 * by the inner component. Skipping those keeps the nodes cheap.
 *
 * Reference: https://reactflow.dev/learn/advanced-use/performance —
 * "Components provided as props to <ReactFlow>, including custom
 * node and edge components, should either be memoized using
 * React.memo".
 */

import type { NodeProps } from 'reactflow';

export function nodePropsEqual<T = any>(
  prev: NodeProps<T>,
  next: NodeProps<T>,
): boolean {
  return (
    prev.id === next.id &&
    prev.type === next.type &&
    prev.selected === next.selected &&
    prev.dragging === next.dragging &&
    prev.data === next.data &&
    prev.isConnectable === next.isConnectable
  );
}
