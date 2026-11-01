import React, { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

export const HeaderTargets = createContext<{
  navigation: HTMLDivElement | null;
  actions: HTMLDivElement | null;
}>({ navigation: null, actions: null });

/** Keep controls with their owning state while placing them in the fixed header. */
export function HeaderPortal({ slot, active, children }: {
  slot: 'navigation' | 'actions'; active: boolean; children: React.ReactNode;
}) {
  const target = useContext(HeaderTargets)[slot];
  return active && target ? createPortal(children, target) : null;
}
