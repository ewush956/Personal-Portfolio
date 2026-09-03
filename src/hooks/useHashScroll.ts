import { useEffect } from 'react';

/** How long to keep correcting the position, and how often, in ms. */
const SETTLE_MS = 600;
const RETRY_MS = 80;

/**
 * Scroll to the element named by the URL hash on a cold load.
 *
 * The page ships as an empty `#root`, so when the browser looks for `#contact`
 * there is nothing to find yet; React renders a moment later and the reader is
 * left at the top. That was invisible while `/` was the only place the section
 * links existed — there a hash change is a same-document scroll the browser
 * handles on its own. The nav rail is on `/graph` now, so every section link
 * from there is a real navigation, and all of them landed on the top of the
 * home page. It fixes a shared `wushke.ca/#projects` link too.
 *
 * Held for a moment rather than done once, because the first scroll is what
 * *causes* the next shift: the theme bar condenses as soon as `scrollY` leaves
 * the top, and it is a sticky element in flow, so losing ~35px of its height
 * pulls every section below it up by that much. Images settling do the same.
 * Re-running until the position stops moving is cheaper than trying to predict
 * either.
 *
 * Abandoned the moment the reader scrolls — being pulled back to an anchor you
 * have already scrolled away from is worse than never having been taken there.
 * Only real input counts: a programmatic scroll raises no wheel or touch event,
 * so the corrections cannot cancel themselves.
 */
export function useHashScroll() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;

    let timer = 0;
    let frame = 0;
    const stop = () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      timer = 0;
      frame = 0;
    };

    window.addEventListener('wheel', stop, { passive: true, once: true });
    window.addEventListener('touchstart', stop, { passive: true, once: true });
    window.addEventListener('keydown', stop, { once: true });

    const started = performance.now();
    const go = () => {
      // `instant`, against the smooth default in base.css: this is where the
      // page should have opened, not a journey from somewhere else. `start`
      // honours `scroll-padding-top`, so the section clears the sticky bar.
      document.getElementById(id)?.scrollIntoView({ behavior: 'instant', block: 'start' });
      if (performance.now() - started < SETTLE_MS) timer = window.setTimeout(go, RETRY_MS);
    };

    frame = requestAnimationFrame(go);

    return () => {
      stop();
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    };
  }, []);
}
