/**
 * Tests for useDragVariable hook.
 *
 * Locks in the template-variable contract used by InputSection and OutputPanel:
 *   - Variable name priority: node.data.label > nodeDefinition.displayName > nodeType > nodeId
 *   - Normalisation: lowercase + remove whitespace
 *   - Drag payload contains both `text/plain` and `application/json`, with the JSON
 *     carrying type/nodeId/nodeName/key/variableTemplate/dataType.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDragVariable } from '../useDragVariable';

// --- Mock the Zustand store --------------------------------------------------

const storeState: { currentWorkflow: any } = {
  currentWorkflow: null,
};

// `useAppStore` is consumed via the documented Zustand slice-selector
// pattern: `useAppStore((s) => s.currentWorkflow)`. The mock has to
// thread the selector through so it returns the right slice — calling
// `useAppStore()` without a selector inside the hook would have given us
// the whole store object and `currentWorkflow.nodes` would be undefined.
vi.mock('../../store/useAppStore', () => ({
  useAppStore: <T,>(selector?: (state: typeof storeState) => T): T | typeof storeState =>
    selector ? selector(storeState) : storeState,
}));

// nodeDefinitions/ was deleted in commit fc10fd3 — the hook now
// resolves via ``lib/nodeSpec.resolveNodeDescription`` off the
// backend NodeSpec cache. The legacy ``vi.mock("../../nodeDefinitions")``
// used to live here; removed so it can't silently mask a real
// import-path bug.


function setWorkflow(nodes: any[]) {
  storeState.currentWorkflow = { nodes, edges: [], name: 'wf', id: 'wf-1', createdAt: new Date(), lastModified: new Date() };
}


function makeDragEvent(): React.DragEvent {
  const setData = vi.fn();
  const ev = {
    dataTransfer: {
      setData,
      effectAllowed: '',
      getData: vi.fn(),
    },
  } as unknown as React.DragEvent;
  return ev;
}


beforeEach(() => {
  storeState.currentWorkflow = null;
});


describe('getTemplateVariableName -- priority order', () => {
  it('uses node.data.label when present (highest priority)', () => {
    setWorkflow([
      {
        id: 'node-1',
        type: 'cronScheduler',
        data: { label: 'My Custom Label' },
        position: { x: 0, y: 0 },
      },
    ]);

    const { result } = renderHook(() => useDragVariable('target-id'));
    expect(result.current.getTemplateVariableName('node-1')).toBe('mycustomlabel');
  });

  it('falls back to nodeDefinition.displayName when no label', () => {
    setWorkflow([
      { id: 'node-2', type: 'cronScheduler', data: {}, position: { x: 0, y: 0 } },
    ]);

    const { result } = renderHook(() => useDragVariable('target-id'));
    expect(result.current.getTemplateVariableName('node-2')).toBe('cronscheduler');
  });

  it('falls back to nodeType when displayName missing', () => {
    setWorkflow([
      { id: 'node-3', type: 'unknownType', data: {}, position: { x: 0, y: 0 } },
    ]);

    const { result } = renderHook(() => useDragVariable('target-id'));
    expect(result.current.getTemplateVariableName('node-3')).toBe('unknowntype');
  });

  it('returns nodeId when source node not found in workflow', () => {
    setWorkflow([]);
    const { result } = renderHook(() => useDragVariable('target-id'));
    expect(result.current.getTemplateVariableName('missing-node')).toBe('missing-node');
  });

  it('returns sourceNodeId when no workflow loaded', () => {
    storeState.currentWorkflow = null;
    const { result } = renderHook(() => useDragVariable('target-id'));
    expect(result.current.getTemplateVariableName('any-id')).toBe('any-id');
  });
});


describe('getTemplateVariableName -- normalisation', () => {
  it('lowercases the label', () => {
    setWorkflow([
      {
        id: 'n1',
        type: 'cronScheduler',
        data: { label: 'UPPERCASE' },
        position: { x: 0, y: 0 },
      },
    ]);
    const { result } = renderHook(() => useDragVariable('t'));
    expect(result.current.getTemplateVariableName('n1')).toBe('uppercase');
  });

  it('removes whitespace from the label', () => {
    setWorkflow([
      {
        id: 'n1',
        type: 'cronScheduler',
        data: { label: 'My  Cron   Scheduler' },
        position: { x: 0, y: 0 },
      },
    ]);
    const { result } = renderHook(() => useDragVariable('t'));
    expect(result.current.getTemplateVariableName('n1')).toBe('mycronscheduler');
  });

  it('normalises displayName fallback the same way', () => {
    setWorkflow([
      { id: 'n1', type: 'httpRequest', data: {}, position: { x: 0, y: 0 } },
    ]);
    const { result } = renderHook(() => useDragVariable('t'));
    expect(result.current.getTemplateVariableName('n1')).toBe('httprequest');
  });

  it('rejects non-string label and falls back to displayName', () => {
    setWorkflow([
      {
        id: 'n1',
        type: 'cronScheduler',
        data: { label: 42 as unknown as string },
        position: { x: 0, y: 0 },
      },
    ]);
    const { result } = renderHook(() => useDragVariable('t'));
    expect(result.current.getTemplateVariableName('n1')).toBe('cronscheduler');
  });
});


describe('handleVariableDragStart -- drag payload', () => {
  beforeEach(() => {
    setWorkflow([
      {
        id: 'src',
        type: 'cronScheduler',
        data: { label: 'Cron Scheduler' },
        position: { x: 0, y: 0 },
      },
    ]);
  });

  it('sets text/plain payload to the variable template', () => {
    const { result } = renderHook(() => useDragVariable('target'));
    const ev = makeDragEvent();
    result.current.handleVariableDragStart(ev, 'src', 'data', { foo: 'bar' });

    expect(ev.dataTransfer.setData).toHaveBeenCalledWith(
      'text/plain',
      '{{cronscheduler.data}}',
    );
  });

  it('sets application/json payload with full metadata', () => {
    const { result } = renderHook(() => useDragVariable('target'));
    const ev = makeDragEvent();
    result.current.handleVariableDragStart(ev, 'src', 'output.field', 42);

    const jsonCall = (ev.dataTransfer.setData as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0] === 'application/json',
    );
    expect(jsonCall).toBeDefined();
    const payload = JSON.parse(jsonCall![1] as string);
    expect(payload).toEqual({
      type: 'nodeVariable',
      nodeId: 'src',
      nodeName: 'cronscheduler',
      key: 'output.field',
      variableTemplate: '{{cronscheduler.output.field}}',
      dataType: 'number',
    });
  });

  it('sets effectAllowed to copy', () => {
    const { result } = renderHook(() => useDragVariable('target'));
    const ev = makeDragEvent();
    result.current.handleVariableDragStart(ev, 'src', 'x', 'y');
    expect(ev.dataTransfer.effectAllowed).toBe('copy');
  });

  it('encodes dataType correctly for various value types', () => {
    const { result } = renderHook(() => useDragVariable('target'));

    const cases = [
      { value: 'hello', expected: 'string' },
      { value: 123, expected: 'number' },
      { value: true, expected: 'boolean' },
      { value: { a: 1 }, expected: 'object' },
      { value: undefined, expected: 'undefined' },
    ];

    for (const { value, expected } of cases) {
      const ev = makeDragEvent();
      result.current.handleVariableDragStart(ev, 'src', 'p', value);
      const call = (ev.dataTransfer.setData as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => c[0] === 'application/json',
      )!;
      const payload = JSON.parse(call[1] as string);
      expect(payload.dataType).toBe(expected);
    }
  });
});
