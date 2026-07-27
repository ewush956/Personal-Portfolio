import { useState } from 'react';
import confetti from 'canvas-confetti';
import type { Project } from '../data/projects';
import { LinkButton } from './ui/Button';
import './ProjectCard.css';

interface ProjectCardProps {
  project: Project;
  onPlayDemo: (videoId: string) => void;
}

export function ProjectCard({ project, onPlayDemo }: ProjectCardProps) {
  const [eggText, setEggText] = useState('Press the mystery button');

  const fireConfetti = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    confetti({
      particleCount: 100,
      spread: 70,
      origin: {
        x: (rect.left + rect.width / 2) / window.innerWidth,
        y: (rect.top + rect.height / 2) / window.innerHeight,
      },
    });
    setEggText('🎉 Nothing happened! 🥳');
    window.setTimeout(() => setEggText('Press the mystery button'), 2000);
  };

  return (
    <article className="card project">
      <div className="project__media">
        <img src={project.image} alt={project.title} className="project__img" loading="lazy" />
      </div>
      <div className="project__body">
        <h3 className="project__title">{project.title}</h3>
        <ul className="project__tags">
          {project.tags.map((tag) => (
            <li className="tag" key={tag}>
              {tag}
            </li>
          ))}
        </ul>
        <p className="project__blurb">{project.blurb}</p>
        <div className="project__actions">
          {project.links.map((link) => (
            <LinkButton key={link.href} href={link.href} variant="ghost">
              {link.label}
            </LinkButton>
          ))}
          {project.demoVideo && (
            <button className="btn btn--solid" onClick={() => onPlayDemo(project.demoVideo!)}>
              Watch demo
            </button>
          )}
          {project.easterEgg && (
            <button className="btn btn--ghost project__egg" onClick={fireConfetti}>
              {eggText}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
