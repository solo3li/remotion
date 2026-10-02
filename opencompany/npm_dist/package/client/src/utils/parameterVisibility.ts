import type { INodeProperties } from '../types/INodeProperties';

/**
 * Wave 10.G.1: shared displayOptions visibility evaluator.
 *
 * Extracted from MiddleSection so ParameterRenderer can apply the same
 * logic inside nested fixedCollection / collection recursions — the
 * previous behaviour rendered nested sub-parameters unconditionally
 * even when their `displayOptions.show` conditions weren't met.
 *
 * Contract: `param.displayOptions.show` is an AND-combined map of
 * { paramName: allowedValue | allowedValue[] }. All conditions must
 * hold against `allParameters` for the param to render.
 */
export const shouldShowParameter = (
  param: INodeProperties,
  allParameters: Record<string, any>,
): boolean => {
  if (!param.displayOptions?.show) return true;
  for (const [name, allowed] of Object.entries(param.displayOptions.show)) {
    const current = allParameters[name];
    if (Array.isArray(allowed)) {
      if (!allowed.includes(current)) return false;
    } else if (current !== allowed) {
      return false;
    }
  }
  return true;
};
