import type { CSSProperties } from 'react';
import { useActiveSection } from './hooks/useActiveSection';
import { useRailCollapsed } from './hooks/useRailCollapsed';
import { Backgrounds } from './components/Backgrounds';
import { NavRail } from './components/NavRail';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { Hero } from './components/Hero';
import { Education } from './components/Education';
import { Projects } from './components/Projects';
import { Contact } from './components/Contact';
import { Footer } from './components/Footer';

export default function App() {
  const [collapsed, toggleRail] = useRailCollapsed();

  // Single scroll-spy observer, shared by the backgrounds and the nav rail.
  const active = useActiveSection(['top', 'education', 'projects', 'contact'], 'top');

  const railWidth: CSSProperties = { ['--rail-w' as string]: collapsed ? '76px' : '216px' };

  return (
    <div className="app" style={railWidth}>
      <Backgrounds active={active} />
      <NavRail active={active} collapsed={collapsed} onToggle={toggleRail} />
      <div className="shell">
        <ThemeSwitcher />
        <main>
          <Hero />
          <Education />
          <Projects />
          <Contact />
        </main>
        <Footer />
      </div>
    </div>
  );
}
