import { useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Node } from 'reactflow';

import { resolveNodeDescription } from '../lib/nodeSpec';
interface DragVariableHookReturn {
  handleVariableDragStart: (
    e: React.DragEvent,
    sourceNodeId: string,
    propertyPath: string,
    value: any
  ) => void;
  getTemplateVariableName: (sourceNodeId: string) => string;
}

/**
 * Hook for handling drag-and-drop of template variables from connected nodes.
 *
 * Template variables use the SOURCE NODE LABEL as the key to ensure uniqueness
 * when multiple nodes of the same type are connected to the same target.
 * This follows the n8n pattern where each node has a unique label.
 *
 * Format: {{normalizedLabel.propertyPath}}
 * Example: {{cronscheduler.data}} or {{cronscheduler1.data}}
 *
 * @param targetNodeId - The ID of the node receiving the drag (target of edge)
 */
export const useDragVariable = (_targetNodeId: string): DragVariableHookReturn => {
  const currentWorkflow = useAppStore((s) => s.currentWorkflow);

  /**
   * Get template variable name for a source node.
   * Uses node label (n8n pattern) for uniqueness when multiple same-type nodes connect.
   * Falls back to displayName -> nodeType -> nodeId for backward compatibility.
   */
  const getTemplateVariableName = useCallback((sourceNodeId: string): string => {
    if (!currentWorkflow) return sourceNodeId;

    // Find the source node by ID
    const sourceNode = (currentWorkflow.nodes || []).find(
      (node: Node) => node.id === sourceNodeId
    );

    if (!sourceNode) return sourceNodeId;

    // Priority: node.data.label > displayName > nodeType > nodeId
    const label = sourceNode.data?.label;
    if (label && typeof label === 'string') {
      // Normalize label: lowercase, remove spaces
      return label.toLowerCase().replace(/\s+/g, '');
    }

    // Fallback to displayName from node definition
    const nodeDef = resolveNodeDescription(sourceNode.type || '');
    if (nodeDef?.displayName) {
      return nodeDef.displayName.toLowerCase().replace(/\s+/g, '');
    }

    // Ultimate fallback: node type or ID
    return (sourceNode.type || sourceNodeId).toLowerCase().replace(/\s+/g, '');
  }, [currentWorkflow]);

  const handleVariableDragStart = useCallback((
    e: React.DragEvent,
    sourceNodeId: string,
    propertyPath: string,
    value: any
  ) => {
    const templateName = getTemplateVariableName(sourceNodeId);
    const variableTemplate = `{{${templateName}.${propertyPath}}}`;

    e.dataTransfer.setData('text/plain', variableTemplate);
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'nodeVariable',
      nodeId: sourceNodeId,  // Include source node ID for reference
      nodeName: templateName,
      key: propertyPath,
      variableTemplate,
      dataType: typeof value
    }));
    e.dataTransfer.effectAllowed = 'copy';
  }, [getTemplateVariableName]);

  return {
    handleVariableDragStart,
    getTemplateVariableName
  };
};
