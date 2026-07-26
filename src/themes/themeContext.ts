import { createContext } from 'react';
import type { Theme, ThemeId } from './registry';

export interface ThemeContextValue {
  themeId: ThemeId;
  theme: Theme;
  themes: Theme[];
  setTheme: (id: ThemeId) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
