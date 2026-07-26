import './Header.css';

const NAV = [
  { label: 'Projects', href: '#projects' },
  { label: 'Contact', href: '#contact' },
  { label: 'Resume', href: '/resume.pdf', external: true },
  { label: 'GitHub', href: 'https://github.com/ewush956', external: true },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/evan-wushke-226a7924b',
    external: true,
  },
];

export function Header() {
  return (
    <header className="header">
      <div className="container header__inner">
        <a className="header__brand" href="#top">
          Evan Wushke
        </a>
        <nav className="header__nav" aria-label="Primary">
          {NAV.map((item) => (
            <a
              key={item.label}
              href={item.href}
              {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
