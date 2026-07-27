import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_THEME, THEMES, isThemeId } from './registry';
import type { ThemeId } from './registry';
import { ThemeContext } from './themeContext';

const STORAGE_KEY = 'portfolio-theme';

function readInitialTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isThemeId(stored) ? stored : DEFAULT_THEME;
}

/** Inject a theme's Google Fonts <link> tags once (deduped by href). */
function ensureFontsLoaded(id: ThemeId): void {
  const theme = THEMES.find((t) => t.id === id);
  if (!theme) return;
  for (const href of theme.fontLinks) {
    if (document.head.querySelector(`link[data-theme-font][href="${href}"]`)) {
      continue;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-theme-font', id);
    document.head.appendChild(link);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(readInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = themeId;
    window.localStorage.setItem(STORAGE_KEY, themeId);
    ensureFontsLoaded(themeId);
  }, [themeId]);

  const setTheme = useCallback((id: ThemeId) => setThemeId(id), []);

  const value = useMemo(() => {
    const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
    return { themeId, theme, themes: THEMES, setTheme };
  }, [themeId, setTheme]);

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
