import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTheme } from '../themes/useTheme';
import './ThemeSwitcher.css';

// The bar condenses as soon as you scroll down at all, and only expands again
// once you're back at the very top. Two thresholds with a dead zone between them
// (hysteresis) decide the state: a single threshold let tiny scroll jitters near
// the boundary flip it repeatedly and strand the staged animation half-collapsed.
// Now scrolling DOWN past CONDENSE_AT condenses, and it stays condensed until
// scrollY returns to the top (EXPAND_AT); anywhere in between holds.
const CONDENSE_AT = 4; // any real scroll down → condense
const EXPAND_AT = 0; //   only fully back at the top → expand

// Choreography (mobile only). Nothing morphs:
//   expanded --(fade content out)--> condensing
//   --(JS resizes the bar, then the circles domino in)--> condensed
// Expanding reverses it. Landscape / reduced-motion skip this (see shouldStage).
const FADE_MS = 200; //     content fades out (bar keeps its size)
const EMPTY_MS = 60; //     brief settle before the bar resizes
const HEIGHT_MS = 340; //   smooth, overshoot-free bar resize
const DOMINO_MS = 340; //   each circle's entrance
const STAGGER_MS = 72; //   gap between circles — the left-to-right domino
const CIRCLE_START = 120; // circles begin once the resize is underway

type Phase = 'expanded' | 'condensing' | 'condensed' | 'expanding';

export function ThemeSwitcher() {
  const { themes, theme, themeId, setTheme } = useTheme();
  const [phase, setPhase] = useState<Phase>('expanded');
  const listRef = useRef<HTMLDivElement>(null);

  // Sequencing state kept in refs so the scroll/timer closures stay stable.
  const phaseRef = useRef<Phase>('expanded');
  const targetRef = useRef(false); // latest desired end state (true = condensed)
  const mountedRef = useRef(false);
  const timerRef = useRef(0);
  // Hand-off to the layout effect that animates the settled phase.
  const entranceRef = useRef<'drop' | 'fade' | null>(null);
  const fromHeightRef = useRef<number | null>(null);
  const animsRef = useRef<Animation[]>([]);

  useEffect(() => {
    const setPhaseTo = (p: Phase) => {
      phaseRef.current = p;
      setPhase(p);
    };
    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = 0;
      }
    };
    const sectionHeight = () => {
      const section = listRef.current?.closest('.themes') as HTMLElement | null;
      return section ? section.getBoundingClientRect().height : null;
    };

    // Advance one beat toward targetRef, scheduling the next beat as needed.
    const step = () => {
      const target = targetRef.current;
      const cur = phaseRef.current;
      if (target) {
        if (cur === 'condensed') return;
        if (cur === 'condensing') {
          fromHeightRef.current = sectionHeight();
          entranceRef.current = 'drop';
          setPhaseTo('condensed');
        } else {
          setPhaseTo('condensing');
          timerRef.current = window.setTimeout(step, FADE_MS + EMPTY_MS);
        }
      } else {
        if (cur === 'expanded') return;
        if (cur === 'expanding') {
          fromHeightRef.current = sectionHeight();
          entranceRef.current = 'fade';
          setPhaseTo('expanded');
        } else {
          setPhaseTo('expanding');
          timerRef.current = window.setTimeout(step, FADE_MS + EMPTY_MS);
        }
      }
    };

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // Hysteresis: hold the current state inside the dead zone. When
        // condensed (target true) only expanding below EXPAND_AT flips it;
        // when expanded only crossing CONDENSE_AT does.
        const y = window.scrollY;
        const next = targetRef.current ? y > EXPAND_AT : y > CONDENSE_AT;
        if (next === targetRef.current && mountedRef.current) return;
        targetRef.current = next;

        const shouldStage =
          window.matchMedia('(max-width: 767px)').matches &&
          !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // First run, landscape, or reduced-motion: jump straight to the end state.
        if (!mountedRef.current || !shouldStage) {
          mountedRef.current = true;
          clearTimer();
          entranceRef.current = null;
          fromHeightRef.current = null;
          setPhaseTo(next ? 'condensed' : 'expanded');
          return;
        }
        clearTimer();
        step();
      });
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
      clearTimer();
    };
  }, []);

  // Once a settled phase lands: smoothly resize the bar from its previous height
  // to the new one, then animate the content in. `fill: backwards` holds each
  // element hidden through its stagger delay so the bar reads as empty first.
  useLayoutEffect(() => {
    const mode = entranceRef.current;
    entranceRef.current = null;
    const fromH = fromHeightRef.current;
    fromHeightRef.current = null;
    const list = listRef.current;
    if (!mode || !list) return;

    const section = list.closest('.themes') as HTMLElement;
    const inner = list.parentElement as HTMLElement;
    const intro = section.querySelector<HTMLElement>('.themes__intro');
    const top = section.querySelector<HTMLElement>('.themes__top');
    const chips = Array.from(list.children) as HTMLElement[];

    animsRef.current.forEach((a) => a.cancel());
    animsRef.current = [];

    // Measure the true final height with transitions frozen (so it's not a
    // mid-transition frame), then animate the bar from its old height to it.
    if (fromH != null) {
      const frozen = [section, inner, intro, top, ...chips].filter(Boolean) as HTMLElement[];
      frozen.forEach((el) => {
        el.style.transition = 'none';
      });
      section.style.height = '';
      section.style.overflow = '';
      void section.offsetHeight;
      const toH = section.getBoundingClientRect().height;
      frozen.forEach((el) => {
        el.style.transition = '';
      });

      if (Math.abs(fromH - toH) > 0.5) {
        section.style.height = `${fromH}px`;
        section.style.overflow = 'hidden'; // clip content while the bar grows
        const hAnim = section.animate([{ height: `${fromH}px` }, { height: `${toH}px` }], {
          duration: HEIGHT_MS,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)', // ease-in-out, no overshoot
        });
        hAnim.onfinish = () => {
          section.style.height = '';
          section.style.overflow = '';
        };
        animsRef.current.push(hAnim);
      }
    }

    if (mode === 'drop') {
      // Circles domino in — perfectly horizontal, left-to-right, no overshoot.
      chips.forEach((chip, i) => {
        animsRef.current.push(
          chip.animate(
            [
              { opacity: 0, transform: 'translateX(-14px)' },
              { opacity: 1, transform: 'translateX(0)' },
            ],
            {
              duration: DOMINO_MS,
              delay: CIRCLE_START + i * STAGGER_MS,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              fill: 'backwards',
            },
          ),
        );
      });
      if (top) {
        top.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 240,
          delay: CIRCLE_START + chips.length * STAGGER_MS + 40,
          easing: 'ease-out',
          fill: 'backwards',
        });
      }
    } else {
      // Returning to expanded: the full chips + intro fade back in (no morph).
      if (intro) {
        intro.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 260,
          easing: 'ease-out',
          fill: 'backwards',
        });
      }
      chips.forEach((chip, i) => {
        animsRef.current.push(
          chip.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 220,
            delay: i * (STAGGER_MS * 0.3),
            easing: 'ease-out',
            fill: 'backwards',
          }),
        );
      });
    }

    return () => {
      animsRef.current.forEach((a) => a.cancel());
      animsRef.current = [];
      section.style.height = '';
      section.style.overflow = '';
    };
  }, [phase]);

  const scrollToTop = () => {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
  };

  const isCondensed = phase === 'condensed';
  const stateClass =
    phase === 'condensed'
      ? ' themes--condensed'
      : phase === 'condensing'
        ? ' themes--condensing'
        : phase === 'expanding'
          ? ' themes--expanding'
          : '';

  return (
    <section className={`themes${stateClass}`} aria-label="Site themes">
      <div className="container themes__inner">
        <button
          type="button"
          className="themes__top"
          onClick={scrollToTop}
          tabIndex={isCondensed ? 0 : -1}
          aria-hidden={!isCondensed}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
          <span>Top</span>
        </button>
        <div className="themes__intro">
          <span className="themes__eyebrow">Themes</span>
          <p className="themes__hint" key={themeId}>
            {theme.splash}
          </p>
        </div>
        <div ref={listRef} className="themes__list" role="radiogroup" aria-label="Choose a theme">
          {themes.map((theme) => {
            const active = theme.id === themeId;
            return (
              <button
                key={theme.id}
                className={`theme-chip${active ? ' theme-chip--active' : ''}`}
                role="radio"
                aria-checked={active}
                title={theme.tagline}
                aria-label={theme.label}
                onClick={() => setTheme(theme.id)}
              >
                <span
                  className="theme-chip__swatch"
                  style={{
                    background: `linear-gradient(135deg, ${theme.swatch[0]} 0 50%, ${theme.swatch[1]} 50% 100%)`,
                  }}
                  aria-hidden="true"
                />
                <span className="theme-chip__label">{theme.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
