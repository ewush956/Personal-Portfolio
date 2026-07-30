import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { DEFAULT_THEME, THEMES, isThemeId } from './registry';
import type { ThemeId } from './registry';
import { ThemeContext } from './themeContext';
import { ensureFontsLoaded, preloadThemeAssets, prefetchAllThemes } from './preloadTheme';
import './viewTransition.css';

const STORAGE_KEY = 'portfolio-theme';

/** Minimal typing for the View Transitions API (not yet in all TS DOM libs). */
type ViewTransition = { ready: Promise<void>; finished: Promise<void> };
type DocumentWithVT = Document & {
  startViewTransition?: (callback: () => void) => ViewTransition;
};

function readInitialTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isThemeId(stored) ? stored : DEFAULT_THEME;
}

/** Radius that reaches the farthest viewport corner from (x, y). */
function maxRadius(x: number, y: number): number {
  const dx = Math.max(x, window.innerWidth - x);
  const dy = Math.max(y, window.innerHeight - y);
  return Math.hypot(dx, dy);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(readInitialTheme);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Fresh current theme for the stable `setTheme` closure; a busy latch guards
  // against overlapping switches (rapid clicks / clicks mid-reveal).
  const themeIdRef = useRef(themeId);
  themeIdRef.current = themeId;
  const busyRef = useRef(false);

  // Committing a theme is just the DOM attribute (drives the CSS cascade) plus
  // persistence + font injection. Runs on mount and on every swap.
  useEffect(() => {
    document.documentElement.dataset.theme = themeId;
    window.localStorage.setItem(STORAGE_KEY, themeId);
    void ensureFontsLoaded(themeId);
  }, [themeId]);

  // Warm every theme's fonts + images once idle so switches are instant.
  useEffect(() => {
    prefetchAllThemes();
  }, []);

  const setTheme = useCallback(async (id: ThemeId, origin?: { x: number; y: number }) => {
    if (busyRef.current || id === themeIdRef.current) return;
    if (!THEMES.some((t) => t.id === id)) return;

    busyRef.current = true;
    setIsTransitioning(true);
    try {
      // Fully load + decode the new theme's fonts and background images BEFORE
      // revealing it, so the reveal shows a fully-painted theme with no FOUT flash.
      await preloadThemeAssets(id);

      const doc = document as DocumentWithVT;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // Plain instant swap only when View Transitions are unavailable or under
      // reduced motion. Otherwise it's always the circular reveal, for a
      // consistent, intentional feel.
      if (!doc.startViewTransition || reduce) {
        setThemeId(id);
        return;
      }

      // Seed the reveal's origin + radius as custom properties; the CSS keyframe
      // animation on ::view-transition-new(root) reads them (see viewTransition.css).
      // Radius is padded 12% so an address-bar/viewport resize mid-reveal can't
      // leave an uncovered edge flashing through.
      const x = origin?.x ?? window.innerWidth / 2;
      const y = origin?.y ?? window.innerHeight / 2;
      const root = document.documentElement;
      root.style.setProperty('--vt-x', `${x}px`);
      root.style.setProperty('--vt-y', `${y}px`);
      root.style.setProperty('--vt-r', `${maxRadius(x, y) * 1.12}px`);

      // Freeze per-element CSS fades so the swap is instant and both snapshots are
      // clean — the circular reveal is then the only animation (see viewTransition.css).
      root.classList.add('vt-theme-swap');

      // The API snapshots the old page, runs our callback to swap the theme,
      // then reveals the new snapshot via the CSS-driven circular clip.
      const transition = doc.startViewTransition(() => {
        // Set the attribute synchronously so the new snapshot is guaranteed fully
        // themed regardless of React effect timing; flushSync syncs the React UI
        // (active chip, splash) into the same snapshot.
        root.dataset.theme = id;
        flushSync(() => setThemeId(id));
      });

      // Keep transitions frozen for the whole reveal (transitions are restored in
      // `finally`), so nothing repaints underneath the overlay mid-animation.
      // Hold `busy` until the reveal ends so a click can't start an overlapping swap.
      await transition.finished.catch(() => {});
    } finally {
      document.documentElement.classList.remove('vt-theme-swap'); // safety net
      busyRef.current = false;
      setIsTransitioning(false);
    }
  }, []);

  const value = useMemo(
    () => {
      const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
      return { themeId, theme, themes: THEMES, setTheme, isTransitioning };
    },
    [themeId, setTheme, isTransitioning],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
