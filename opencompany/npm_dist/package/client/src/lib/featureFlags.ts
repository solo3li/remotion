/**
 * Feature flags read from Vite env (`import.meta.env.VITE_*`).
 *
 * Flags that gate in-flight migration work — flip them to `true` in
 * `.env.local` to opt the dev build into the new path. Wave 6 uses
 * `VITE_NODESPEC_BACKEND` to gate the backend-driven NodeSpec flow
 * alongside the legacy `nodeDefinitions/*.ts` flow.
 *
 * Keep this module tiny and dep-free — it is imported from render-path
 * components and should never force a React Query dep at top-level.
 */

const readEnv = (key: string): string | undefined => {
  try {
    return (import.meta as any).env?.[key];
  } catch {
    return undefined;
  }
};

const isFalsy = (value: string | undefined): boolean => {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === 'false' || v === '0' || v === 'no' || v === 'off';
};

export const featureFlags = {
  /** Wave 6 Phase 3e: fetch NodeSpec from the backend as the default
   *  source of truth for parameter schemas. Set
   *  `VITE_NODESPEC_BACKEND=false` in `.env.local` to opt back into
   *  the legacy `client/src/nodeDefinitions/*.ts` read path (useful
   *  as a kill-switch if you hit an adapter regression). */
  nodeSpecBackend: !isFalsy(readEnv('VITE_NODESPEC_BACKEND')),
} as const;

export type FeatureFlags = typeof featureFlags;
