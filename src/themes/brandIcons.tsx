/* Per-theme brand marks shown in the nav rail (replacing plain initials).
   Each inherits `currentColor` so it takes the theme's accent. */
import type { ReactNode, SVGProps } from 'react';
import type { ThemeId } from './registry';

const s: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const BRAND_ICONS: Record<ThemeId, ReactNode> = {
  // Synthwave — a striped retro sun
  synthwave: (
    <svg {...s}>
      <circle cx="12" cy="11" r="7" />
      <path d="M6.5 12.5h11M8 15.5h8M10 18.2h4" />
    </svg>
  ),
  // Sleep Token — a crescent moon
  'sleep-token': (
    <svg {...s} strokeWidth={1.4}>
      <path d="M20 14.2A8 8 0 1 1 9.8 4 6.4 6.4 0 0 0 20 14.2Z" fill="currentColor" stroke="none" />
    </svg>
  ),
  // Doom — a skull
  doom: (
    <svg {...s}>
      <path d="M6 11a6 6 0 0 1 12 0v2.3c0 .8-.4 1.5-1.1 1.9l-.4.3V18h-2v-1.5h-1V18h-1v-1.5h-1V18H9v-2.5l-.5-.3C7.8 14.8 6 14.1 6 13.3z" />
      <circle cx="9.5" cy="11" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="11" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  ),
  // Editorial — a pen nib
  editorial: (
    <svg {...s}>
      <path d="M5 19l2-6.5 7.5-7.5 4 4L11 16.5 5 19z" />
      <path d="M7 12.5l4.5 4.5" />
      <path d="M13.5 5.5l4 4" />
    </svg>
  ),
  // Hacker Bro — a terminal prompt
  'hacker-bro': (
    <svg {...s}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9.5l3 2.5-3 2.5" />
      <path d="M13 14.5h4" />
    </svg>
  ),
};
