/**
 * ActionBar — bottom themed action buttons driven by a config array.
 * Replaces the 5 identical action button sections across panels.
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { ActionButton } from '@/components/ui/action-button';
import type { ActionButtonIntent } from '@/components/ui/action-button';

export interface ActionDef {
  key: string;
  label: string;
  /** Semantic role consumed by `<ActionButton intent="...">`. */
  intent: ActionButtonIntent;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  hidden?: boolean;
}

interface Props {
  actions: ActionDef[];
  loading: string | null;
}

const ActionBar: React.FC<Props> = ({ actions, loading }) => {
  return (
    <div className="flex justify-center gap-2 border-t border-border pt-3">
      {actions
        .filter((a) => !a.hidden)
        .map((a) => {
          const isLoading = loading === a.key;
          return (
            <ActionButton
              key={a.key}
              intent={a.intent}
              onClick={a.onClick}
              disabled={a.disabled || isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : a.icon}
              {a.label}
            </ActionButton>
          );
        })}
    </div>
  );
};

export default ActionBar;
