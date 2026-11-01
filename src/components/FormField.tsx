import React, { createContext, useContext, useEffect, useState } from 'react';
import { Input } from './ui';

export const FieldValidity = createContext<(label: string, error: string | null) => void>(() => {});

/** Text and numeric drafts stay local until blur, so clearing an input is safe. */
export function Field({ label, value, onCommit, type = 'number', min, max, step = 'any' }: {
  label: string; value: string | number; onCommit: (value: string) => string | null;
  type?: 'text' | 'number'; min?: number; max?: number; step?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const reportValidity = useContext(FieldValidity);
  useEffect(() => { setDraft(String(value)); setError(null); }, [value]);
  useEffect(() => () => reportValidity(label, null), [label, reportValidity]);
  return <label style={{ display: 'block', fontSize: 13, color: '#cbd5e1' }}>
    {label}
    <Input aria-label={label} type={type} min={min} max={max} step={step} value={draft}
      aria-invalid={!!error}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { const result = onCommit(draft); setError(result); reportValidity(label, result); }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    {error && <span style={{ display: 'block', marginTop: 6, color: '#fca5a5', fontSize: 12 }}>{error}</span>}
  </label>;
}

