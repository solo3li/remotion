import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { resolveNodeDescription } from '../lib/nodeSpec';
import { useWebSocket } from '../contexts/WebSocketContext';
import {
  useNodeParamsQuery,
  useSaveNodeParamsMutation,
} from './useNodeParamsQuery';

/**
 * Build the default parameter map from a node definition's `properties`.
 * Pure function so a single instance can be reused across renders without
 * re-allocating per node type.
 */
function defaultsForNodeType(nodeType: string): Record<string, any> {
  const def = resolveNodeDescription(nodeType);
  if (!def?.properties) return {};
  const defaults: Record<string, any> = {};
  for (const param of def.properties as any[]) {
    defaults[param.name] = param.default !== undefined ? param.default : null;
  }
  return defaults;
}

export const useParameterPanel = () => {
  const selectedNode = useAppStore((s) => s.selectedNode);
  const setSelectedNode = useAppStore((s) => s.setSelectedNode);
  const { sendRequest, isConnected } = useWebSocket();

  const nodeId = selectedNode?.id;
  const nodeType = selectedNode?.type;

  // Server-cached read.
  const paramsQuery = useNodeParamsQuery(nodeId);
  const saveMutation = useSaveNodeParamsMutation();

  // Local edit buffer. Initialized from defaults + saved params on the
  // first successful query, then mutated by user edits until save.
  const [editBuffer, setEditBuffer] = useState<Record<string, any>>({});
  const [originalParameters, setOriginalParameters] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);

  // Initialize the edit buffer once per node selection. Identity of
  // sendRequest / saveMutation / paramsQuery.data churns on every render,
  // so we must NOT depend on them — that would trigger an infinite loop
  // because the optimistic setQueryData on save mints a fresh data object.
  // The ref guard keeps initialization bound to nodeId transitions only.
  const initializedFor = useRef<string | null>(null);
  // Stable refs to read-only deps the effect needs without listing them.
  const sendRequestRef = useRef(sendRequest);
  sendRequestRef.current = sendRequest;
  const saveMutationRef = useRef(saveMutation);
  saveMutationRef.current = saveMutation;
  const queryDataRef = useRef(paramsQuery.data);
  queryDataRef.current = paramsQuery.data;

  useEffect(() => {
    if (!nodeType || !nodeId) {
      setEditBuffer({});
      setOriginalParameters({});
      setError(null);
      initializedFor.current = null;
      return;
    }
    if (paramsQuery.isLoading) return;
    if (initializedFor.current === nodeId) return;
    initializedFor.current = nodeId;

    const defaults = defaultsForNodeType(nodeType);
    const saved = queryDataRef.current?.parameters ?? {};
    const initial: Record<string, any> = { ...defaults, ...saved };

    setEditBuffer(initial);
    setOriginalParameters(initial);
  }, [nodeId, nodeType, paramsQuery.isLoading]);

  // Surface query errors.
  useEffect(() => {
    setError(paramsQuery.isError ? 'Failed to load saved parameters' : null);
  }, [paramsQuery.isError]);

  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(editBuffer) !== JSON.stringify(originalParameters);
  }, [editBuffer, originalParameters]);

  const handleParameterChange = useCallback((paramName: string, value: any) => {
    setEditBuffer((prev) => ({ ...prev, [paramName]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!nodeId) return;
    try {
      await saveMutation.mutateAsync({
        nodeId,
        parameters: editBuffer,
        version: paramsQuery.data?.version,
      });
      setOriginalParameters({ ...editBuffer });
      setError(null);
    } catch (err) {
      console.error('Failed to save parameters via WebSocket:', err);
      setError('Failed to save parameters');
    }
  }, [nodeId, editBuffer, saveMutation, paramsQuery.data?.version]);

  const handleCancel = useCallback(() => {
    setEditBuffer({ ...originalParameters });
    setSelectedNode(null);
  }, [originalParameters, setSelectedNode]);

  // Wave 6 Phase 3e hot-path wiring. When VITE_NODESPEC_BACKEND is off
  // (default), resolveNodeDescription returns the local fallback
  // unchanged. When on, it returns the backend NodeSpec adapted to the
  // INodeTypeDescription shape so the entire parameter panel (Middle
  // / Input / Output sections + ParameterRenderer) renders from
  // server-driven metadata without any per-component change.
  const nodeDefinition = nodeType
    ? resolveNodeDescription(nodeType)
    : null;

  return {
    selectedNode,
    nodeDefinition,
    parameters: editBuffer,
    hasUnsavedChanges,
    handleParameterChange,
    handleSave,
    handleCancel,
    isLoading: paramsQuery.isLoading,
    isSaving: saveMutation.isPending,
    error,
    isConnected,
  };
};
