import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useActiveSection } from './hooks/useActiveSection';
import { Backgrounds } from './components/Backgrounds';
import { NavRail } from './components/NavRail';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { Hero } from './components/Hero';
import { Projects } from './components/Projects';
import { Contact } from './components/Contact';
import { Footer } from './components/Footer';

const RAIL_STORAGE_KEY = 'rail-collapsed';

export default function App() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(RAIL_STORAGE_KEY) === 'true',
  );

  useEffect(() => {
    localStorage.setItem(RAIL_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  // Single scroll-spy observer, shared by the backgrounds and the nav rail.
  const active = useActiveSection(['top', 'projects', 'contact'], 'top');

  const railWidth: CSSProperties = { ['--rail-w' as string]: collapsed ? '76px' : '216px' };

  return (
    <div className="app" style={railWidth}>
      <Backgrounds active={active} />
      <NavRail active={active} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="shell">
        <ThemeSwitcher />
        <main>
          <Hero />
          <Projects />
          <Contact />
        </main>
        <Footer />
      </div>
    </div>
  );
}
