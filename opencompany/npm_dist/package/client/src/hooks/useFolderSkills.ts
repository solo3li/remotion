/**
 * Per-folder skill metadata query.
 *
 * Wraps the `scan_skill_folder` WebSocket request in TanStack Query so:
 *  - sibling surfaces (MasterSkillEditor, MiddleSection) reading the
 *    same folder share one network call
 *  - SKILL.md frontmatter (icon / color / description) is the single
 *    source of truth -- the frontend no longer maintains a per-skill
 *    icon override table
 *
 * Cache key matches the in-place query MasterSkillEditor used to
 * declare inline, so existing cache hits carry over.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useWebSocket } from '../contexts/WebSocketContext';
import { STALE_TIME } from '../lib/queryConfig';
import { dracula } from '../styles/theme';

export interface AvailableSkill {
  type: string;
  skillName: string;
  displayName: string;
  icon: string;
  color: string;
  description: string;
}

export const folderSkillsQueryKey = (folder: string) =>
  ['folderSkills', folder] as const;

interface ScanSkillFolderResponse {
  success: boolean;
  skills?: Array<{
    name: string;
    description: string;
    metadata?: Record<string, any>;
  }>;
  error?: string;
}

const titleCase = (slug: string): string =>
  slug
    .split('-')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

export function useFolderSkills(
  folder: string | undefined | null,
): UseQueryResult<AvailableSkill[], Error> {
  const { sendRequest, isReady } = useWebSocket();
  return useQuery<AvailableSkill[], Error>({
    queryKey: folderSkillsQueryKey(folder ?? ''),
    queryFn: async () => {
      if (!folder) return [];
      const response = await sendRequest<ScanSkillFolderResponse>(
        'scan_skill_folder',
        { folder },
      );
      if (!response?.success || !response.skills) return [];
      return response.skills.map((s) => ({
        type: s.name,
        skillName: s.name,
        displayName: titleCase(s.name),
        icon: s.metadata?.icon ?? '',
        color: s.metadata?.color ?? dracula.purple,
        description: s.description ?? '',
      }));
    },
    enabled: !!folder && isReady,
    staleTime: STALE_TIME.MEDIUM,
  });
}
