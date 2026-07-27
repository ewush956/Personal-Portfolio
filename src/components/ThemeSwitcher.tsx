import { useTheme } from '../themes/useTheme';
import './ThemeSwitcher.css';

export function ThemeSwitcher() {
  const { themes, theme, themeId, setTheme } = useTheme();

  return (
    <section className="themes" aria-label="Site themes">
      <div className="container themes__inner">
        <div className="themes__intro">
          <span className="themes__eyebrow">Themes</span>
          <p className="themes__hint" key={themeId}>
            {theme.splash}
          </p>
        </div>
        <div className="themes__list" role="radiogroup" aria-label="Choose a theme">
          {themes.map((theme) => {
            const active = theme.id === themeId;
            return (
              <button
                key={theme.id}
                className={`theme-chip${active ? ' theme-chip--active' : ''}`}
                role="radio"
                aria-checked={active}
                title={theme.tagline}
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
