import { useState, useCallback, useEffect } from 'react';
import { listCachedNodeSpecs } from '../lib/nodeSpec';

const STORAGE_KEY = 'component_palette_collapsed_sections';

export const useComponentPalette = () => {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    // Try to load from localStorage first
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Ignore parsing errors
    }

    // Default: all sections collapsed. Categories are derived from the
    // cached NodeSpecs; empty pre-prefetch, filled in once specs arrive.
    const initialCollapsed: Record<string, boolean> = {};
    const categories = new Set(listCachedNodeSpecs().flatMap(s => s.group ?? []));
    categories.forEach(category => {
      initialCollapsed[category] = true;
    });
    return initialCollapsed;
  });

  const [searchQuery, setSearchQuery] = useState<string>('');

  // Persist collapsed sections to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsedSections));
    } catch {
      // Ignore storage errors
    }
  }, [collapsedSections]);

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  }, []);

  return {
    collapsedSections,
    searchQuery,
    setSearchQuery,
    toggleSection,
  };
};