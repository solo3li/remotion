/**
 * StatusCard — config-driven status list.
 * Config provides data (ok/trueText/falseText); component resolves theme colors.
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import type { StatusRowDef } from '../types';

interface Props {
  icon: React.ReactNode;
  title: string;
  rows: StatusRowDef[];
  status: any;
}

const StatusCard: React.FC<Props> = ({ icon, title, rows, status }) => {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2 text-sm font-semibold">
        {icon}
        <span>{title}</span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((r) => {
          const ok = r.ok(status);
          const variant: 'success' | 'warning' | 'destructive' = ok
            ? 'success'
            : r.warn
              ? 'warning'
              : 'destructive';
          return (
            <div
              key={r.label}
              className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 text-sm"
            >
              <span className="text-muted-foreground">{r.label}</span>
              <Badge variant={variant}>{ok ? r.trueText : r.falseText}</Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StatusCard;
