import { getCachedNodeSpec } from '../lib/nodeSpec';
import { Node, Edge } from 'reactflow';
import { INodeExecutionData } from '../types/INodeProperties';
import { API_CONFIG } from '../config/api';

import { resolveNodeDescription } from '../lib/nodeSpec';
// Execution result with n8n-compatible data
export interface ExecutionResult {
  success: boolean;
  nodeId: string;
  nodeType: string;
  nodeName: string;
  timestamp: string;
  executionTime: number;
  outputs?: Record<string, any>;
  error?: string;
  data?: any;
  nodeData: INodeExecutionData[][];
  /**
   * Backend-issued correlation token (uuid4 hex) that identifies a
   * single run end-to-end. Carried through every node_status broadcast
   * for the run plus the execute_node response payload, so dedup logic
   * in OutputSection compares execution_id rather than the brittle
   * JSON.stringify(outputs). Optional for results constructed before
   * a backend response is available (e.g. catch-block error stubs).
   */
  executionId?: string;
}

// WebSocket execution function type (passed from components using useWebSocket)
export type WebSocketExecuteFn = (
  nodeId: string,
  nodeType: string,
  parameters: Record<string, any>,
  nodes?: any[],
  edges?: any[]
) => Promise<any>;

// WebSocket parameter getter type
export type WebSocketGetParametersFn = (nodeId: string) => Promise<{ parameters: Record<string, any> } | null>;

// No frontend cache - backend is single source of truth

// ============================================================================
// EXECUTION SERVICE - Migrated to Python backend
// ============================================================================

export class ExecutionService {
  // ============================================================================
  // WEBSOCKET-BASED EXECUTION - Primary execution method
  // ============================================================================

  /**
   * Execute node via WebSocket (preferred method)
   * Use this when you have access to WebSocket functions from useWebSocket hook
   */
  static async executeNodeViaWebSocket(
    nodeId: string,
    nodeType: string,
    wsExecute: WebSocketExecuteFn,
    wsGetParameters: WebSocketGetParametersFn,
    nodes?: Node[],
    edges?: Edge[]
  ): Promise<ExecutionResult> {
    try {
      console.log(`[WS Execution] Starting: ${nodeId} (type: ${nodeType})`);

      const startTime = Date.now();

      // Load parameters via WebSocket
      const paramsResult = await wsGetParameters(nodeId);
      const parameters = paramsResult?.parameters || {};
      console.log(`[WS Execution] Parameters for ${nodeId}:`, parameters);

      // Prepare nodes and edges
      const nodeData = nodes?.map(node => ({
        id: node.id,
        type: node.type || '',
        data: node.data || {}
      })) || [];

      const edgeData = edges?.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle || undefined,
        targetHandle: edge.targetHandle || undefined
      })) || [];

      // Execute via WebSocket
      const result = await wsExecute(nodeId, nodeType, parameters, nodeData, edgeData);

      console.log(`[WS Execution] Result:`, result);

      const executionTime = Date.now() - startTime;

      if (result.success) {
        const outputData = result.result || {
          nodeId,
          success: true,
          message: 'Execution completed successfully',
          timestamp: result.timestamp || new Date().toISOString()
        };

        const nodeExecutionData: INodeExecutionData[][] = [[{
          json: outputData
        }]];

        return {
          success: true,
          nodeId,
          nodeType,
          nodeName: resolveNodeDescription(nodeType)?.displayName || nodeType,
          timestamp: result.timestamp || new Date().toISOString(),
          executionTime: result.execution_time || executionTime,
          outputs: outputData,
          data: outputData,
          nodeData: nodeExecutionData,
          executionId: result.execution_id,
        };
      } else {
        const errorOutputData = result.result || {
          error: result.error,
          nodeId,
          success: false,
          timestamp: result.timestamp || new Date().toISOString()
        };

        const errorData: INodeExecutionData[][] = [[{
          json: errorOutputData
        }]];

        return {
          success: false,
          nodeId,
          nodeType,
          nodeName: resolveNodeDescription(nodeType)?.displayName || nodeType,
          timestamp: result.timestamp || new Date().toISOString(),
          executionTime: result.execution_time || executionTime,
          error: result.error,
          outputs: errorOutputData,
          data: errorOutputData,
          nodeData: errorData,
          executionId: result.execution_id,
        };
      }

    } catch (error: any) {
      console.error(`[WS Execution] Failed for node ${nodeId}:`, error);

      const catchErrorData = {
        error: error.message || 'WebSocket execution failed',
        nodeId,
        success: false,
        timestamp: new Date().toISOString()
      };

      return {
        success: false,
        nodeId,
        nodeType,
        nodeName: resolveNodeDescription(nodeType)?.displayName || nodeType,
        timestamp: new Date().toISOString(),
        executionTime: 0,
        error: error.message || 'WebSocket execution failed',
        outputs: catchErrorData,
        data: catchErrorData,
        nodeData: [[{ json: catchErrorData }]]
      };
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Check backend health status
   */
  static async checkBackendHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${API_CONFIG.PYTHON_BASE_URL}/api/workflow/health`);
      const health = await response.json();
      return health.status === 'OK';
    } catch (error) {
      console.warn('Backend health check failed:', error);
      return false;
    }
  }

  /**
   * Wave 10.E: a node is executable iff the backend has a NodeSpec
   * for it. The plugin registry is the single source of truth — every
   * type with an input model + handler appears in the spec endpoint,
   * so cache lookup answers "supported?" without enumerating families.
   * Falls back to the legacy frontend `nodeDefinitions` registry while
   * the spec cache is still warming.
   */
  static isNodeTypeSupported(nodeType: string): boolean {
    return getCachedNodeSpec(nodeType) !== null;
  }
}