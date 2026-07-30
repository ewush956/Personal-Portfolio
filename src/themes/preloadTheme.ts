/* ==========================================================================
   Theme asset preloading — fonts + section background images.

   Theme switching used to feel abrupt: colors flip instantly (CSS cascade off
   `data-theme`) while fonts (async <link>) and the large background JPGs
   settled a beat later, popping in after the fact. To make the swap feel
   production-grade we preload a theme's assets BEFORE revealing it, so the new
   theme paints all at once behind the iris-wipe transition.
   ========================================================================== */

import { THEMES } from './registry';
import type { ThemeId } from './registry';

/** Inject a theme's Google Fonts <link> tags once (deduped by href). */
export function ensureFontsLoaded(id: ThemeId): void {
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

/**
 * Read a theme's background-image URLs without committing the theme.
 *
 * Theme tokens are defined on plain `[data-theme='<id>']` selectors, which match
 * ANY element — so an off-screen probe with the attribute set resolves the same
 * `--bg-*` values the real page would use. We parse the `url(...)` refs out of
 * the hero / projects / contact layer tokens.
 */
function getThemeAssetUrls(id: ThemeId): string[] {
  const probe = document.createElement('div');
  probe.dataset.theme = id;
  probe.style.display = 'none';
  document.body.appendChild(probe);

  const cs = getComputedStyle(probe);
  const urls = new Set<string>();
  for (const token of ['--bg-hero', '--bg-projects', '--bg-contact']) {
    const value = cs.getPropertyValue(token);
    for (const match of value.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) {
      urls.add(match[2]);
    }
  }

  probe.remove();
  return [...urls];
}

/** Resolve once an image finishes — treating 404s as "done" so we never hang. */
function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve(); // themes without real files fall back to a gradient
    img.src = src;
  });
}

/** Resolve after `ms`, so a slow/absent asset can never stall the transition. */
function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Preload everything a theme needs (fonts + background images) before it is
 * revealed. Always settles within `timeoutMs` even if an asset stalls.
 */
export async function preloadThemeAssets(id: ThemeId, timeoutMs = 1500): Promise<void> {
  ensureFontsLoaded(id);

  const images = getThemeAssetUrls(id).map(preloadImage);
  const work = Promise.all([...images, document.fonts.ready]);

  await Promise.race([work, timeout(timeoutMs)]);
}
