/**
 * Credentials panel UI store.
 *
 * Holds ONLY UI state — `selectedId`, `paletteOpen`, `query`. The catalogue
 * data itself lives in TanStack Query (see `hooks/useCatalogueQuery.ts`).
 * Derived data (filtered providers, prepared fuzzysort index, byId Map)
 * lives in `useMemo` inside the component that needs it.
 *
 * Why: a Zustand selector that closes over a 5000-entry catalogue retains
 * the whole array in the closure scope forever. The fix is to never put
 * the catalogue inside the store. See
 * `docs-internal/credentials_scaling/research_react_stack.md` — "Top 5
 * runtime/memory traps", trap #1.
 */

import { create } from 'zustand';

export interface CredentialRegistryUIState {
  selectedId: string | null;
  paletteOpen: boolean;
  query: string;

  setSelectedId: (id: string | null) => void;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  setQuery: (q: string) => void;
  reset: () => void;
}

const INITIAL: Pick<CredentialRegistryUIState, 'selectedId' | 'paletteOpen' | 'query'> = {
  selectedId: null,
  paletteOpen: false,
  query: '',
};

export const useCredentialRegistry = create<CredentialRegistryUIState>((set) => ({
  ...INITIAL,
  setSelectedId: (id) => set({ selectedId: id }),
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  setQuery: (q) => set({ query: q }),
  reset: () => set(INITIAL),
}));
