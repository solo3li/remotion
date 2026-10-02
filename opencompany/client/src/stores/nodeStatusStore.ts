/**
 * Per-workflow node status store.
 *
 * Replaces the `useState<Record<workflowId, Record<nodeId, NodeStatus>>>`
 * that previously lived inside WebSocketContext. Status writes there
 * forced every `useWebSocket()` consumer to re-render — at 50 canvas
 * nodes + 1 status tick that produced ~200 component re-renders.
 *
 * Zustand stores are built on `useSyncExternalStore`, so a slice
 * selector like `useNodeStatus(nodeId)` only re-renders when *that
 * specific* slot changes. Status writes for other nodes are invisible
 * to consumers of this slot.
 *
 * Reference: https://react.dev/reference/react/useSyncExternalStore
 */

import { create } from 'zustand';
import type { NodeStatus } from '../contexts/WebSocketContext';

interface NodeStatusState {
  /** workflowId -> nodeId -> NodeStatus */
  allStatuses: Record<string, Record<string, NodeStatus>>;
  /** Currently-focused workflow id (mirrored from useAppStore). */
  currentWorkflowId: string | undefined;

  setCurrentWorkflowId: (id: string | undefined) => void;
  /** Replace one node's status atomically. */
  setStatus: (workflowId: string, nodeId: string, status: NodeStatus) => void;
  /** Replace one workflow's full status map (used by initial-status broadcast). */
  setStatusesForWorkflow: (
    workflowId: string,
    statuses: Record<string, NodeStatus>,
  ) => void;
  /** Merge a multi-workflow batch into the store. */
  mergeStatuses: (
    grouped: Record<string, Record<string, NodeStatus>>,
  ) => void;
  /** Drop a single node's status entry. */
  clearStatus: (workflowId: string, nodeId: string) => void;
  /** Drop every status entry for a workflow (used on workflow delete). */
  clearWorkflow: (workflowId: string) => void;
}

export const useNodeStatusStore = create<NodeStatusState>((set) => ({
  allStatuses: {},
  currentWorkflowId: undefined,

  setCurrentWorkflowId: (id) =>
    set((state) =>
      state.currentWorkflowId === id ? state : { currentWorkflowId: id },
    ),

  setStatus: (workflowId, nodeId, status) =>
    set((state) => {
      const workflowSlot = state.allStatuses[workflowId] ?? {};
      const previous = workflowSlot[nodeId];
      // Reference equality short-circuit so identical status payloads
      // do not trigger a store-wide notify (which would wake every
      // selector). Caller is expected to pass a fresh object only when
      // something actually changed.
      if (previous === status) return state;
      return {
        allStatuses: {
          ...state.allStatuses,
          [workflowId]: { ...workflowSlot, [nodeId]: status },
        },
      };
    }),

  setStatusesForWorkflow: (workflowId, statuses) =>
    set((state) => ({
      allStatuses: { ...state.allStatuses, [workflowId]: statuses },
    })),

  mergeStatuses: (grouped) =>
    set((state) => ({
      allStatuses: { ...state.allStatuses, ...grouped },
    })),

  clearStatus: (workflowId, nodeId) =>
    set((state) => {
      const slot = state.allStatuses[workflowId];
      if (!slot || !(nodeId in slot)) return state;
      const next = { ...slot };
      delete next[nodeId];
      return { allStatuses: { ...state.allStatuses, [workflowId]: next } };
    }),

  clearWorkflow: (workflowId) =>
    set((state) => {
      if (!(workflowId in state.allStatuses)) return state;
      const next = { ...state.allStatuses };
      delete next[workflowId];
      return { allStatuses: next };
    }),
}));

/**
 * Slice selector: returns the NodeStatus for `nodeId` in the currently
 * focused workflow. Re-renders only when *that specific* slot changes.
 */
export function useNodeStatusForId(
  nodeId: string,
): NodeStatus | undefined {
  return useNodeStatusStore((s) => {
    const wf = s.currentWorkflowId;
    return wf ? s.allStatuses[wf]?.[nodeId] : undefined;
  });
}

/**
 * Slice selector: returns the flat statuses map for the currently
 * focused workflow. Re-renders only when that workflow's slot changes.
 * Use this where the consumer genuinely needs the full map (e.g. the
 * `useIsToolExecuting` matcher); prefer `useNodeStatusForId` for
 * single-node consumers.
 */
export function useCurrentWorkflowStatuses(): Record<string, NodeStatus> {
  return useNodeStatusStore((s) => {
    const wf = s.currentWorkflowId;
    return wf ? (s.allStatuses[wf] ?? EMPTY) : EMPTY;
  });
}

const EMPTY: Record<string, NodeStatus> = Object.freeze({});

/** Non-reactive snapshot for imperative reads (e.g. event handlers). */
export function getNodeStatusSnapshot(
  nodeId: string,
): NodeStatus | undefined {
  const { allStatuses, currentWorkflowId } = useNodeStatusStore.getState();
  if (!currentWorkflowId) return undefined;
  return allStatuses[currentWorkflowId]?.[nodeId];
}
