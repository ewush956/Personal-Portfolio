import { useEffect, useState } from 'react';
import './Backgrounds.css';

/** Section id in the DOM → background layer token. */
const SECTIONS = [
  { key: 'hero', domId: 'top', varName: '--bg-hero' },
  { key: 'projects', domId: 'projects', varName: '--bg-projects' },
  { key: 'contact', domId: 'contact', varName: '--bg-contact' },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

/**
 * Fixed, full-viewport background layers that cross-fade (with a subtle zoom)
 * as the user scrolls between sections — echoing the original site's
 * scroll-driven background transitions, but theme-aware and per-section.
 */
export function Backgrounds() {
  const [active, setActive] = useState<SectionKey>('hero');

  useEffect(() => {
    const ratios = new Map<SectionKey, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const match = SECTIONS.find((s) => s.domId === entry.target.id);
          if (match) ratios.set(match.key, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        // The most-visible section wins.
        let best: SectionKey = 'hero';
        let bestRatio = -1;
        for (const { key } of SECTIONS) {
          const r = ratios.get(key) ?? 0;
          if (r > bestRatio) {
            bestRatio = r;
            best = key;
          }
        }
        setActive(best);
      },
      { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1], rootMargin: '-15% 0px -15% 0px' },
    );

    for (const { domId } of SECTIONS) {
      const el = document.getElementById(domId);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="backgrounds" aria-hidden="true">
      {SECTIONS.map(({ key, varName }) => (
        <div
          key={key}
          className={`bg-layer${active === key ? ' bg-layer--active' : ''}`}
          style={{ background: `var(${varName})` }}
        />
      ))}
    </div>
  );
}
