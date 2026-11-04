import React, { useEffect, useId, useRef, useState } from 'react';

export default function InfoPopover({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); button.current?.focus(); }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open]);
  return <span className="info-popover" ref={root}>
    <button ref={button} type="button" className="info-button" aria-label={`About ${label}`} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>i</button>
    {open && <span className="info-popup" id={id} role="note">{children}</span>}
  </span>;
}
