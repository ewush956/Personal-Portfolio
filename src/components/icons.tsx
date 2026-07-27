/* Inline SVG icons — no dependency, inherit `currentColor` so they re-skin with
   the theme. Stroke icons for sections, filled brand marks for GitHub/LinkedIn. */
import type { SVGProps } from 'react';

const stroke: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export function HomeIcon() {
  return (
    <svg {...stroke}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
  );
}

export function ProjectsIcon() {
  // A little computer/monitor — projects are things built at the machine.
  return (
    <svg {...stroke}>
      <rect x="3" y="4" width="18" height="12" rx="1.6" />
      <path d="M12 16v4" />
      <path d="M8.5 20h7" />
      <path d="M7 8.5 9 10.5 7 12.5" />
    </svg>
  );
}

export function ContactIcon() {
  return (
    <svg {...stroke}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}

export function ResumeIcon() {
  return (
    <svg {...stroke}>
      <path d="M6 2.5h8L19 7v14.5H6z" />
      <path d="M14 2.5V7h5" />
      <path d="M9 12h6M9 15.5h6M9 8.5h2" />
    </svg>
  );
}

export function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 1.5a10.5 10.5 0 0 0-3.32 20.46c.52.1.71-.23.71-.5v-1.77c-2.9.63-3.52-1.4-3.52-1.4-.48-1.2-1.16-1.53-1.16-1.53-.95-.65.07-.64.07-.64 1.05.08 1.6 1.08 1.6 1.08.94 1.6 2.46 1.14 3.06.87.1-.68.37-1.14.67-1.4-2.32-.26-4.76-1.16-4.76-5.16 0-1.14.4-2.07 1.07-2.8-.11-.26-.47-1.32.1-2.75 0 0 .88-.28 2.87 1.07a9.9 9.9 0 0 1 5.22 0c2-1.35 2.87-1.07 2.87-1.07.57 1.43.21 2.49.1 2.75.67.73 1.07 1.66 1.07 2.8 0 4.01-2.45 4.9-4.78 5.15.38.33.71.97.71 1.96v2.9c0 .28.19.61.72.5A10.5 10.5 0 0 0 12 1.5Z" />
    </svg>
  );
}

export function LinkedinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14ZM7.12 20.45H3.55V9h3.57v11.45ZM22.22 0H1.77C.8 0 0 .78 0 1.75v20.5C0 23.22.8 24 1.77 24h20.45C23.2 24 24 23.22 24 22.25V1.75C24 .78 23.2 0 22.22 0Z" />
    </svg>
  );
}

export function ChevronIcon() {
  return (
    <svg {...stroke}>
      <path d="m14 6-6 6 6 6" />
    </svg>
  );
}
