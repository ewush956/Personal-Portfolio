/* ==========================================================================
   Theme registry — the ONLY TypeScript file to touch when adding a theme.
   To add a theme: add an entry here, create `themes/definitions/<id>.css`
   (see definitions/_contract.css), and @import it in themes/themes.css.
   The theme then automatically appears in the switcher and applies everywhere.
   ========================================================================== */

export type ThemeId =
  | 'synthwave'
  | 'hacker-bro'
  | 'sleep-token'
  | 'editorial'
  | 'doom';

export interface Theme {
  id: ThemeId;
  /** Display name shown in the switcher chip. */
  label: string;
  /** One-line vibe shown as a tooltip / subtitle. */
  tagline: string;
  /** Two swatch colors used to preview the palette on the chip. */
  swatch: [string, string];
  /** Google Fonts stylesheet URLs, lazy-loaded the first time the theme is used. */
  fontLinks: string[];
}

export const DEFAULT_THEME: ThemeId = 'synthwave';

export const THEMES: Theme[] = [
  {
    id: 'synthwave',
    label: 'Synthwave',
    tagline: 'Neon cyan & pink on a midnight grid',
    swatch: ['#06eeff', '#ff5cf4'],
    fontLinks: [
      'https://fonts.googleapis.com/css2?family=Comfortaa:wght@400;700&display=swap',
    ],
  },
  {
    id: 'hacker-bro',
    label: 'Hacker Bro',
    tagline: 'Green-on-black terminal, scanlines and all',
    swatch: ['#00ff9c', '#0a0f0a'],
    fontLinks: [
      'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=JetBrains+Mono:wght@400;700&display=swap',
    ],
  },
  {
    id: 'sleep-token',
    label: 'Sleep Token',
    tagline: 'Deep forest green & ritual gold',
    swatch: ['#c9a24b', '#0c1f17'],
    fontLinks: [
      'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap',
    ],
  },
  {
    id: 'editorial',
    label: 'Editorial',
    tagline: 'Warm paper, serif headlines, print calm',
    swatch: ['#c2410c', '#f4efe6'],
    fontLinks: [
      'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,800;1,600&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap',
    ],
  },
  {
    id: 'doom',
    label: 'Can It Run Doom?',
    tagline: 'Rust, blood & 8-bit hellfire',
    swatch: ['#e8331b', '#1a0f0c'],
    fontLinks: [
      'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap',
    ],
  },
];

export const THEME_IDS = THEMES.map((t) => t.id);

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_IDS.includes(value as ThemeId);
}
