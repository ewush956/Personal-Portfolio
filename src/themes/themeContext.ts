import { createContext } from 'react';
import type { Theme, ThemeId } from './registry';

export interface ThemeContextValue {
  themeId: ThemeId;
  theme: Theme;
  themes: Theme[];
  /** Switch themes. `origin` (a click point) seeds the iris-wipe transition. */
  setTheme: (id: ThemeId, origin?: { x: number; y: number }) => void;
  /** True while the iris-wipe transition is in flight. */
  isTransitioning: boolean;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
