import { useTheme } from '../themes/useTheme';
import { EDUCATION } from '../data/education';
import { Reveal } from './ui/Reveal';
import './Education.css';

/** Warm the graph route's chunk on intent, so the click feels instant. */
function prefetchGraph() {
  void import('../graph/GraphPage');
}

export function Education() {
  const { themeId } = useTheme();
  const { degree, school, concentration, gpa, blurb } = EDUCATION;

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
                <p className="edu-card__school">{school}</p>
                <p className="edu-card__focus">
                  {concentration}
                  {gpa && (
                    <>
                      {' · '}
                      <span className="edu-card__gpa">GPA {gpa}</span>
                    </>
                  )}
                </p>
              </header>

              <p className="edu-card__blurb">{blurb}</p>

              <a
                className="edu-cta"
                href="/graph"
                onMouseEnter={prefetchGraph}
                onFocus={prefetchGraph}
              >
                <span className="edu-cta__label">{EDUCATION.cta.label}</span>
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
