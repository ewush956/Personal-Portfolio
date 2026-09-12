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

/**
 * The reveal circle's origin and radius, as PERCENTAGES of the pseudo-element
 * it will be clipped into.
 *
 * Percentages rather than pixels, and that is the whole point. The clip is
 * applied to ::view-transition-new(root), whose reference box is NOT reliably
 * the CSS viewport: at devicePixelRatio 2 Chromium resolves it against a box in
 * DEVICE pixels and then displays the pseudo scaled down by the dpr. Handing it
 * CSS pixels therefore drew the circle at 1/dpr — half the origin and half the
 * radius on a 2x display. It looked like the reveal "stopped halfway and
 * vanished" and started nowhere near the button, while every timing measurement
 * of the animation came back perfect, because the animation was fine and the
 * geometry was not.
 *
 * A percentage is resolved inside that box whatever its scale, so the scale
 * factor cancels and the circle lands on the button at dpr 1, 2 or anything
 * else. For the radius that relies on the rule that `circle(<percentage>)`
 * resolves to `P% * sqrt(w^2 + h^2) / sqrt(2)` of its reference box: express
 * the reach we want as a fraction of the viewport's own diagonal and the box
 * size drops out of both sides.
 *
 * `reach` is the distance to the farthest viewport corner, padded 12% so an
 * address-bar or viewport resize mid-reveal can't leave an edge flashing
 * through.
 */
function revealGeometry(x: number, y: number) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const reach = Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) * 1.12;
  return {
    x: `${(x / w) * 100}%`,
    y: `${(y / h) * 100}%`,
    r: `${((reach * Math.SQRT2) / Math.hypot(w, h)) * 100}%`,
  };
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
      //
      // Deliberately NOT gated on the result. `preloadThemeAssets` reports
      // whether everything settled inside its budget, and gating the reveal on
      // that was tried and reverted: `img.decode()` on an already-cached image
      // can simply never settle in Chromium, so the report comes back false on
      // switches where the assets are in fact perfectly warm, and the reveal
      // silently stops happening at all. A late-decoding asset costs a flash;
      // trusting this value costs the whole animation.
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
      // All three are percentages — see `revealGeometry`, and do not "simplify"
      // them back to pixels.
      const x = origin?.x ?? window.innerWidth / 2;
      const y = origin?.y ?? window.innerHeight / 2;
      const geom = revealGeometry(x, y);
      const root = document.documentElement;
      root.style.setProperty('--vt-x', geom.x);
      root.style.setProperty('--vt-y', geom.y);
      root.style.setProperty('--vt-r', geom.r);

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
