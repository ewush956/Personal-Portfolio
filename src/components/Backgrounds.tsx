import './Backgrounds.css';

/** DOM section id → background layer token. */
const LAYERS = [
  { domId: 'top', varName: '--bg-hero' },
  { domId: 'projects', varName: '--bg-projects' },
  { domId: 'contact', varName: '--bg-contact' },
] as const;

/**
 * Fixed, full-viewport background layers that cross-fade (with a subtle zoom)
 * as the user scrolls between sections — echoing the original site's
 * scroll-driven background transitions, but theme-aware and per-section.
 * The active section is provided by App (single shared observer).
 */
export function Backgrounds({ active }: { active: string }) {
  return (
    <div className="backgrounds" aria-hidden="true">
      {LAYERS.map(({ domId, varName }) => (
        <div
          key={domId}
          className={`bg-layer${active === domId ? ' bg-layer--active' : ''}`}
          style={{ background: `var(${varName})` }}
        />
      ))}
    </div>
  );
}
