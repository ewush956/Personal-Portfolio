import { SKILLS } from '../data/skills';
import './SkillsMarquee.css';

export function SkillsMarquee() {
  // Duplicate the list so the marquee can loop seamlessly.
  const loop = [...SKILLS, ...SKILLS];
  return (
    <div className="marquee" aria-label="Technical skills">
      <ul className="marquee__track">
        {loop.map((skill, i) => (
          <li className="marquee__item" key={`${skill.name}-${i}`} aria-hidden={i >= SKILLS.length}>
            <img src={skill.icon} alt={skill.name} loading="lazy" width="40" height="40" />
          </li>
        ))}
      </ul>
    </div>
  );
}
