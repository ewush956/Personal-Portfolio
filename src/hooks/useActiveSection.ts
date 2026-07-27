import { useEffect, useState } from 'react';

/**
 * Returns the DOM id of the section currently most in view. Shared by the nav
 * rail (scroll-spy highlight) and the backgrounds (cross-fade), so both stay in
 * sync from a single observer.
 */
export function useActiveSection(ids: string[], fallback: string): string {
  const [active, setActive] = useState(fallback);

  useEffect(() => {
    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        let best = fallback;
        let bestRatio = -1;
        for (const id of ids) {
          const r = ratios.get(id) ?? 0;
          if (r > bestRatio) {
            bestRatio = r;
            best = id;
          }
        }
        setActive(best);
      },
      { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1], rootMargin: '-15% 0px -15% 0px' },
    );

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // ids is a stable literal from the caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallback]);

  return active;
}
