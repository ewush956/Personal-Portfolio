import { motion, useReducedMotion } from 'motion/react';
import { SkillsMarquee } from './SkillsMarquee';
import './Hero.css';

export function Hero() {
  const reduce = useReducedMotion();
  const stagger = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay: 0.1 + i * 0.12, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <section className="hero" id="top">
      <div className="container hero__inner">
        <motion.p className="hero__eyebrow" {...stagger(0)}>
          Software Developer
        </motion.p>
        <motion.h1 className="hero__title" {...stagger(1)}>
          Evan Wushke
        </motion.h1>

        <div className="hero__cards">
          <motion.article className="card hero__about" {...stagger(2)}>
            <span className="card__label">About Me</span>
            <div className="hero__about-grid">
              <img
                src="/images/picture_with_cat.png"
                alt="Portrait of Evan Wushke"
                className="hero__portrait"
                width="220"
                height="220"
              />
              <h2 className="hero__about-heading">Hi there! Welcome to my portfolio.</h2>
              <p className="hero__about-copy">
                My education has pushed me through web development, systems programming,
                algorithms, and low-level software. What keeps me interested is giving life to
                creative thoughts and exploring how far computers can be pushed when design and
                engineering meet.
              </p>
            </div>
          </motion.article>

          <motion.article className="card hero__skills" {...stagger(3)}>
            <span className="card__label">Technical Skills</span>
            <h2 className="hero__skills-heading">
              I&apos;ve learned a thing or two from building so many projects.
            </h2>
            <p className="hero__skills-copy">
              Hands-on experience across modern frontend development, backend tooling, data work,
              and systems-level programming — moving between languages and frameworks to fit the
              problem.
            </p>
            <SkillsMarquee />
          </motion.article>
        </div>

        <motion.a className="hero__cta" href="#projects" {...stagger(4)}>
          View Projects
          <span className="hero__cta-arrow" aria-hidden="true">
            ↓
          </span>
        </motion.a>
      </div>
    </section>
  );
}
