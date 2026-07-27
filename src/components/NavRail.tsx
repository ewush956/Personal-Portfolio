import { useActiveSection } from '../hooks/useActiveSection';
import {
  ChevronIcon,
  ContactIcon,
  GithubIcon,
  HomeIcon,
  LinkedinIcon,
  ProjectsIcon,
  ResumeIcon,
} from './icons';
import './NavRail.css';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Section id to match for scroll-spy (internal anchors only). */
  sectionId?: string;
  external?: boolean;
}

const SECTION_ITEMS: NavItem[] = [
  { label: 'Home', href: '#top', icon: <HomeIcon />, sectionId: 'top' },
  { label: 'Projects', href: '#projects', icon: <ProjectsIcon />, sectionId: 'projects' },
  { label: 'Contact', href: '#contact', icon: <ContactIcon />, sectionId: 'contact' },
];

const EXTERNAL_ITEMS: NavItem[] = [
  { label: 'Resume', href: '/resume.pdf', icon: <ResumeIcon />, external: true },
  { label: 'GitHub', href: 'https://github.com/ewush956', icon: <GithubIcon />, external: true },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/evan-wushke-226a7924b',
    icon: <LinkedinIcon />,
    external: true,
  },
];

interface NavRailProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function NavRail({ collapsed, onToggle }: NavRailProps) {
  const active = useActiveSection(['top', 'projects', 'contact'], 'top');

  const renderItem = (item: NavItem) => {
    const isActive = item.sectionId === active;
    return (
      <li key={item.label}>
        <a
          className={`rail__link${isActive ? ' rail__link--active' : ''}`}
          data-rail-id={item.label.toLowerCase()}
          href={item.href}
          title={item.label}
          aria-label={item.label}
          aria-current={isActive ? 'true' : undefined}
          {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          <span className="rail__icon">{item.icon}</span>
          <span className="rail__label">{item.label}</span>
        </a>
      </li>
    );
  };

  return (
    <nav className="rail" data-collapsed={collapsed} aria-label="Primary">
      <a className="rail__brand" href="#top" aria-label="Evan Wushke — home">
        <span className="rail__brand-mark">EW</span>
        <span className="rail__brand-full">Evan Wushke</span>
      </a>

      <ul className="rail__group">{SECTION_ITEMS.map(renderItem)}</ul>

      <ul className="rail__group rail__group--external">{EXTERNAL_ITEMS.map(renderItem)}</ul>

      <button
        className="rail__toggle"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        <span className="rail__toggle-icon" data-collapsed={collapsed}>
          <ChevronIcon />
        </span>
        <span className="rail__label">Collapse</span>
      </button>
    </nav>
  );
}
