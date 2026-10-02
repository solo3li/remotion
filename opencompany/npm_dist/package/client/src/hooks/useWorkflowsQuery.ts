/**
 * Workflow list + single-workflow queries, and save/delete mutations.
 *
 * Server-owned data (the workflow list and individual workflow records)
 * lives in the TanStack Query cache, not in Zustand. The Zustand store
 * keeps only the mutable edit buffer (currentWorkflow). When a save or
 * delete completes, these mutations invalidate `['workflows']` so any
 * component consuming `useWorkflowsQuery()` re-renders with fresh data.
 *
 * Mirrors the ownership boundary established by `useCatalogueQuery.ts`.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  workflowApi,
  type WorkflowSummary,
  type WorkflowData as ApiWorkflowData,
} from '../services/workflowApi';

export const WORKFLOWS_QUERY_KEY = ['workflows'] as const;
export const workflowQueryKey = (id: string) => ['workflow', id] as const;

export interface SavedWorkflow {
  id: string;
  name: string;
  nodeCount: number;
  createdAt: Date;
  lastModified: Date;
}

function toSavedWorkflow(w: WorkflowSummary): SavedWorkflow {
  return {
    id: w.id,
    name: w.name,
    nodeCount: w.nodeCount,
    createdAt: new Date(w.createdAt),
    lastModified: new Date(w.lastModified),
  };
}

export function useWorkflowsQuery(): UseQueryResult<SavedWorkflow[], Error> {
  return useQuery<SavedWorkflow[], Error>({
    queryKey: WORKFLOWS_QUERY_KEY,
    queryFn: async () => {
      const list = await workflowApi.getAllWorkflows();
      return list.map(toSavedWorkflow);
    },
    staleTime: 30_000,
  });
}

export interface SaveWorkflowInput {
  id: string;
  name: string;
  data: { nodes: any[]; edges: any[] };
}

export function useSaveWorkflowMutation() {
  const qc = useQueryClient();
  return useMutation<void, Error, SaveWorkflowInput>({
    mutationFn: async ({ id, name, data }) => {
      const ok = await workflowApi.saveWorkflow(id, name, data);
      if (!ok) throw new Error('Failed to save workflow');
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: WORKFLOWS_QUERY_KEY });
    },
  });
}

export function useDeleteWorkflowMutation() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const ok = await workflowApi.deleteWorkflow(id);
      if (!ok) throw new Error('Failed to delete workflow');
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: WORKFLOWS_QUERY_KEY });
    },
  });
}

export function useWorkflowQuery(id: string | null | undefined) {
  return useQuery<ApiWorkflowData | null, Error>({
    queryKey: id ? workflowQueryKey(id) : ['workflow', 'none'],
    queryFn: () => (id ? workflowApi.getWorkflow(id) : Promise.resolve(null)),
    enabled: !!id,
    staleTime: 30_000,
  });
}
