import { useState } from 'react';
import { PROJECTS } from '../data/projects';
import { ProjectCard } from './ProjectCard';
import { Reveal } from './ui/Reveal';
import { Modal } from './ui/Modal';
import './Projects.css';

export function Projects() {
  const [demo, setDemo] = useState<string | null>(null);

  return (
    <section className="section projects" id="projects">
      <div className="container">
        <Reveal>
          <h2 className="section-title">projects.</h2>
        </Reveal>
        <div className="projects__grid">
          {PROJECTS.map((project, i) => (
            <Reveal as="div" index={i} key={project.title}>
              <ProjectCard project={project} onPlayDemo={setDemo} />
            </Reveal>
          ))}
        </div>
      </div>

      <Modal open={demo !== null} onClose={() => setDemo(null)} label="Project demo video">
        {demo && (
          <iframe
            src={`https://www.youtube.com/embed/${demo}?autoplay=1`}
            title="Project demo"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        )}
      </Modal>
    </section>
  );
}
