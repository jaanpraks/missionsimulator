import React from 'react';

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel-card" style={{ border: '1px solid #1f2937', borderRadius: 12, background: 'rgba(15, 23, 42, 0.6)', padding: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        boxSizing: 'border-box',
        width: '100%',
        marginTop: 6,
        padding: '7px 10px',
        borderRadius: 8,
        border: '1px solid #334155',
        background: 'rgba(2,6,23,0.35)',
        color: '#e2e8f0',
        outline: 'none'
      }}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{
        boxSizing: 'border-box',
        width: '100%',
        marginTop: 6,
        padding: '10px 12px',
        borderRadius: 14,
        border: '1px solid #334155',
        background: 'rgba(2,6,23,0.35)',
        color: '#e2e8f0',
        outline: 'none'
      }}
    />
  );
}

export function Button({ children, variant = 'primary', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const base: React.CSSProperties = {
    padding: '10px 12px',
    borderRadius: 14,
    border: '1px solid #334155',
    cursor: 'pointer',
    fontWeight: 700
  };
  const style: React.CSSProperties =
    variant === 'primary'
      ? { ...base, background: '#e2e8f0', color: '#0b1220', borderColor: '#e2e8f0' }
      : { ...base, background: 'transparent', color: '#e2e8f0' };

  return (
    <button {...rest} style={style}>
      {children}
    </button>
  );
}

export function ChipBar({ value, options, onChange }: { value: string; options: { id: string; label: string }[]; onChange: (id: string) => void }) {
  return (
    <div className="chip-bar">
      {options.map((o) => (
        <button
          key={o.id}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          style={{
            padding: '6px 10px',
            borderRadius: 7,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            background: value === o.id ? '#e2e8f0' : 'transparent',
            color: value === o.id ? '#0b1220' : '#e2e8f0'
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
