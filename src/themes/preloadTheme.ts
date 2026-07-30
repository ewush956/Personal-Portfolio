/* ==========================================================================
   Theme asset preloading — fonts + section background images.

   Theme switching used to feel abrupt: colors flip instantly (CSS cascade off
   `data-theme`) while fonts (async <link>) and the large background JPGs
   settled a beat later, popping in after the fact. To make the swap feel
   production-grade we genuinely download a theme's assets BEFORE revealing it,
   so the new theme paints all at once behind the circular reveal.
   ========================================================================== */

import { THEMES } from './registry';
import type { Theme, ThemeId } from './registry';

/**
 * Inject a theme's Google Fonts <link> tags once (deduped by href) and resolve
 * once the stylesheets have loaded — so the @font-face rules are registered and
 * `document.fonts.load()` can then force the actual font files to download.
 */
export function ensureFontsLoaded(id: ThemeId): Promise<void> {
  const theme = THEMES.find((t) => t.id === id);
  if (!theme) return Promise.resolve();

  const waits: Promise<void>[] = [];
  for (const href of theme.fontLinks) {
    const existing = document.head.querySelector<HTMLLinkElement>(
      `link[data-theme-font][href="${href}"]`,
    );
    if (existing) continue; // already injected (and, in practice, already registered)

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-theme-font', id);
    waits.push(
      new Promise<void>((resolve) => {
        link.onload = () => resolve();
        link.onerror = () => resolve();
      }),
    );
    document.head.appendChild(link);
  }
  return Promise.all(waits).then(() => undefined);
}

/** Font family names declared in a Google Fonts URL (e.g. `EB+Garamond` → `EB Garamond`). */
function fontFamilies(theme: Theme): string[] {
  const families: string[] = [];
  for (const href of theme.fontLinks) {
    try {
      const params = new URL(href).searchParams;
      for (const spec of params.getAll('family')) {
        const name = spec.split(':')[0].replace(/\+/g, ' ').trim();
        if (name) families.push(name);
      }
    } catch {
      /* malformed URL — skip */
    }
  }
  return families;
}

/**
 * Actually download a theme's fonts. A web font only loads when it's applied to
 * rendered text, so awaiting `document.fonts.ready` here would be a no-op (the
 * theme isn't applied yet). Instead we register the stylesheet, then explicitly
 * `load()` each family — this fetches the font files up front and prevents the
 * FOUT flash that otherwise appears right after the reveal.
 */
async function loadFonts(id: ThemeId): Promise<void> {
  const theme = THEMES.find((t) => t.id === id);
  if (!theme) return;
  await ensureFontsLoaded(id);
  const loads: Promise<unknown>[] = [];
  for (const family of fontFamilies(theme)) {
    // A couple of weights to cover both display headings and body text.
    loads.push(document.fonts.load(`1em "${family}"`).catch(() => undefined));
    loads.push(document.fonts.load(`700 1em "${family}"`).catch(() => undefined));
  }
  await Promise.all(loads);
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

/**
 * Fully download AND decode an image so it's ready to paint (not just fetched).
 * `decode()` resolves only once the bitmap is decoded; `new Image().onload`
 * fires earlier, at download, which can leave a blank frame in the snapshot.
 * 404s (themes with no real file, which fall back to a gradient) reject → resolve.
 */
function preloadImage(src: string): Promise<void> {
  const img = new Image();
  img.src = src;
  return img.decode().then(
    () => undefined,
    () => undefined,
  );
}

/** Resolve after `ms`, so a slow/absent asset can never stall the transition. */
function timeout<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * Preload everything a theme needs (fonts + background images) before it is
 * revealed. Resolves `true` when the assets are genuinely ready to paint, or
 * `false` if they didn't settle within `timeoutMs` — the caller uses that to
 * avoid revealing a half-painted theme (which flashes).
 */
export async function preloadThemeAssets(id: ThemeId, timeoutMs = 1200): Promise<boolean> {
  const images = getThemeAssetUrls(id).map(preloadImage);
  const work = Promise.all([loadFonts(id), ...images]).then(() => true);

  return Promise.race([work, timeout(timeoutMs, false)]);
}

const warmed = new Set<ThemeId>();

/**
 * Warm every theme's assets in the background once the page is idle, so the
 * first (and every) switch is instant instead of waiting on a cold fetch.
 * Runs once; safe to call repeatedly.
 */
export function prefetchAllThemes(): void {
  const run = () => {
    for (const theme of THEMES) {
      if (warmed.has(theme.id)) continue;
      warmed.add(theme.id);
      void preloadThemeAssets(theme.id, 15000);
    }
  };

  const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number })
    .requestIdleCallback;
  if (ric) ric(run);
  else window.setTimeout(run, 1200);
}
