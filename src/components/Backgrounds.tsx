import { useActiveSection } from '../hooks/useActiveSection';
import './Backgrounds.css';

/** DOM section id → background layer token. */
const LAYERS = [
  { domId: 'top', varName: '--bg-hero' },
  { domId: 'projects', varName: '--bg-projects' },
  { domId: 'contact', varName: '--bg-contact' },
] as const;

const SECTION_IDS = LAYERS.map((l) => l.domId);

/**
 * Fixed, full-viewport background layers that cross-fade (with a subtle zoom)
 * as the user scrolls between sections — echoing the original site's
 * scroll-driven background transitions, but theme-aware and per-section.
 */
export function Backgrounds() {
  const active = useActiveSection(SECTION_IDS, 'top');

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
