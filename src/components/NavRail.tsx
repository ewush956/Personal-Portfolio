import { useTheme } from '../themes/useTheme';
import { BRAND_ICONS } from '../themes/brandIcons';
import {
  ChevronIcon,
  ContactIcon,
  EducationIcon,
  GithubIcon,
  GraphIcon,
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
  /** What `active` has to equal for this item to be lit. On the portfolio this
      is a scroll-spy section id; on /graph the page passes the route's own. */
  sectionId?: string;
  external?: boolean;
}

const SECTION_ITEMS: NavItem[] = [
  { label: 'Home', href: '/#top', icon: <HomeIcon />, sectionId: 'top' },
  { label: 'Education', href: '/#education', icon: <EducationIcon />, sectionId: 'education' },
  { label: 'Projects', href: '/#projects', icon: <ProjectsIcon />, sectionId: 'projects' },
  { label: 'Contact', href: '/#contact', icon: <ContactIcon />, sectionId: 'contact' },
  /* A real route rather than an anchor, so it is a plain full navigation — the
     same one Education's card already makes. It sits with the sections rather
     than the external links because it is part of the site. */
  { label: 'Graph', href: '/graph', icon: <GraphIcon />, sectionId: 'graph' },
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
  /** The `sectionId` of the item to light: a scroll-spy section, or 'graph'. */
  active: string;
  collapsed: boolean;
  onToggle: () => void;
}

export function NavRail({ active, collapsed, onToggle }: NavRailProps) {
  const { themeId } = useTheme();

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
      <a className="rail__brand" href="/#top" aria-label="Evan Wushke — home">
        <span className="rail__brand-mark">{BRAND_ICONS[themeId]}</span>
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
