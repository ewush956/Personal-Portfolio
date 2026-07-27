import { motion, useReducedMotion } from 'motion/react';
import { useTheme } from '../themes/useTheme';
import type { ThemeId } from '../themes/registry';
import { SkillsMarquee } from './SkillsMarquee';
import './Hero.css';

/** Per-theme portrait (same photo, theme-matched background). */
const PROFILE: Record<ThemeId, string> = {
  synthwave: '/images/synthwave-profile.png',
  'sleep-token': '/images/sleep-token-profile.png',
  doom: '/images/doom-profile.png',
  editorial: '/images/editorial-profile.png',
  'hacker-bro': '/images/hacker-bro-profile.png',
};

export function Hero() {
  const { themeId } = useTheme();
  const portrait = PROFILE[themeId] ?? '/images/picture_with_cat.png';
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
              <h2 className="hero__about-heading">Hi there! Welcome to my portfolio.</h2>
              <img
                src={portrait}
                alt="Portrait of Evan Wushke"
                className="hero__portrait"
              />
              <p className="hero__about-copy">
                I’ve had exposure to all ends of tech, but I’ve really taken a
                liking to front-end development. I LOVE being creative, and working on the front
                end lets me bring things to life. I’ll gladly continue to Google “How do I center a
                div?”. I take pride in my work, so I always welcome feedback. We’re always
                learning, so feel free to reach out so we can grow together!
              </p>
            </div>
          </motion.article>

          <motion.article className="card hero__skills" {...stagger(3)}>
            <span className="card__label">Technical Skills</span>
            <h2 className="hero__skills-heading">
              I&apos;ve learned a thing or two from building so many projects.
            </h2>
            <p className="hero__skills-copy">
              I’ve been fortunate enough to have a lot of hands-on experience. As such, I’ve
              picked up many languages, frameworks, technologies, etc. Really, in this age of AI,
              the important thing is being able to recognize GOOD code and GOOD system design.
              Lucky for me, I’ve had lots of practice with that, and I’ve developed an intuition
              for production-ready code.
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
