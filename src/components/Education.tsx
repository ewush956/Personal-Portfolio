import { useTheme } from '../themes/useTheme';
import { EDUCATION } from '../data/education';
import { GRAPH_STATS } from '../data/graphStats';
import { Reveal } from './ui/Reveal';
import './Education.css';

/** Warm the graph route's chunk on intent, so the click feels instant. */
function prefetchGraph() {
  void import('../graph/GraphPage');
}

export function Education() {
  const { themeId } = useTheme();
  const { degree, school, concentration, focus, timeframe, blurb } = EDUCATION;

  return (
    <section className="section education" id="education">
      <div className="container">
        <Reveal>
          <h2 className="section-title">education.</h2>
        </Reveal>

        <Reveal index={1}>
          <article className="edu-card">
            <div className="edu-card__body">
              <header className="edu-card__head">
                <h3 className="edu-card__degree">{degree}</h3>
                <p className="edu-card__school">
                  {school}
                  {timeframe && <span className="edu-card__when"> · {timeframe}</span>}
                </p>
                <p className="edu-card__focus">
                  {concentration} · Focus in {focus}
                </p>
              </header>

              <p className="edu-card__blurb">{blurb}</p>

              <dl className="edu-card__creds">
                {EDUCATION.credentials.map((c) => (
                  <div className="edu-cred" key={c.label}>
                    <dt>{c.label}</dt>
                    <dd>{c.value}</dd>
                  </div>
                ))}
              </dl>

              <a
                className="edu-cta"
                href="/graph"
                onMouseEnter={prefetchGraph}
                onFocus={prefetchGraph}
              >
                <span className="edu-cta__label">{EDUCATION.cta.label}</span>
                <span className="edu-cta__meta">
                  {EDUCATION.cta.lead}{' '}
                  {GRAPH_STATS.notes.toLocaleString()} notes,{' '}
                  {GRAPH_STATS.courses} courses and{' '}
                  {GRAPH_STATS.links.toLocaleString()} links you can walk through.
                </span>
              </a>
            </div>

            <a
              className="edu-card__preview"
              href="/graph"
              tabIndex={-1}
              aria-hidden="true"
              onMouseEnter={prefetchGraph}
            >
              <img
                src={`/images/graph-preview-${themeId}.jpg`}
                alt=""
                loading="lazy"
                decoding="async"
                width={1400}
                height={1000}
              />
            </a>
          </article>
        </Reveal>
      </div>
    </section>
  );
}
