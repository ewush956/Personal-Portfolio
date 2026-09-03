import type { Ref } from 'react';
import { useTheme } from '../themes/useTheme';
/* One stylesheet for the whole theme-control family. The chips' condensed form
   is defined alongside the bar's condensed state — they are the same rules —
   so splitting the file would mean maintaining the circles twice. */
import './ThemeSwitcher.css';

interface ThemeChipsProps {
  /** Renders the chips as bare swatches — the condensed form. */
  dots?: boolean;
  /** The scroll-driven choreography in `ThemeSwitcher` measures the list. */
  listRef?: Ref<HTMLDivElement>;
}

/**
 * The theme radiogroup itself, with no bar around it.
 *
 * Split out of `ThemeSwitcher` so the graph's top bar can mount the same
 * control without inheriting the portfolio's sticky, scroll-choreographed
 * shell — there is nothing to scroll on a fixed-viewport canvas, so the graph
 * takes the condensed form directly and skips the whole state machine.
 * `ThemeSwitcher` keeps the shell and the animation; both share these buttons,
 * so a chip only ever looks and behaves one way.
 */
export function ThemeChips({ dots = false, listRef }: ThemeChipsProps) {
  const { themes, themeId, setTheme, isTransitioning } = useTheme();

  return (
    <div
      ref={listRef}
      className={`themes__list${dots ? ' themes__list--dots' : ''}`}
      role="radiogroup"
      aria-label="Choose a theme"
    >
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
            disabled={isTransitioning}
            onClick={(e) => {
              // Keyboard activation reports clientX/Y as 0 — seed the iris from
              // the button's center instead of the viewport corner.
              const origin =
                e.detail === 0
                  ? (() => {
                      const r = e.currentTarget.getBoundingClientRect();
                      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                    })()
                  : { x: e.clientX, y: e.clientY };
              setTheme(theme.id, origin);
            }}
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
  );
}
