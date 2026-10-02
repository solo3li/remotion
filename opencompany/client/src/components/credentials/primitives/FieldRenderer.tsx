/**
 * FieldRenderer — generic schema-driven field renderer (n8n CredentialInputs pattern).
 * Takes a FieldDef[] array + the form shim from useCredentialPanel.
 */

import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FieldDef } from '../types';

interface CredentialFormShim {
  getFieldValue: (key: string) => string | undefined;
  setFieldValue: (key: string, value: string) => void;
}

interface Props {
  fields: FieldDef[];
  form: CredentialFormShim;
}

const FieldRenderer: React.FC<Props> = ({ fields, form }) => {
  return (
    <div className="flex w-full flex-col gap-3">
      {fields.map((f) => (
        <FieldRow key={f.key} field={f} form={form} />
      ))}
    </div>
  );
};

interface FieldRowProps {
  field: FieldDef;
  form: CredentialFormShim;
}

const FieldRow: React.FC<FieldRowProps> = ({ field, form }) => {
  const [revealed, setRevealed] = useState(false);
  // Local state for the controlled input — same pattern ApiKeyPanel
  // uses. Reading the value directly from form.getFieldValue (backed by
  // a TanStack Query cache) introduces a render-timing gap in the
  // controlled-input loop that drops keystrokes. Local state avoids it;
  // we mirror to the form on every change so panel-level getFieldValue
  // still works for Save Credentials.
  const initial = form.getFieldValue(field.key) ?? '';
  const [value, setValue] = useState(initial);
  const isSecret = !!field.secret;

  // When the stored value arrives (query resolves), seed the local
  // state. After that, user input is authoritative.
  useEffect(() => {
    if (!value && initial) setValue(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`field-${field.key}`} className="text-xs">
        {field.label}
        {field.required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <div className="relative">
        <Input
          id={`field-${field.key}`}
          type={isSecret && !revealed ? 'password' : 'text'}
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            setValue(v);
            form.setFieldValue(field.key, v);
          }}
          placeholder={field.placeholder}
          className={isSecret ? 'font-mono pr-9' : 'font-mono'}
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={revealed ? 'Hide value' : 'Show value'}
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
};

export default FieldRenderer;
