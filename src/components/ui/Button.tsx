import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './Button.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'solid' | 'ghost';
}

export function Button({ children, variant = 'ghost', className = '', ...rest }: ButtonProps) {
  return (
    <button className={`btn btn--${variant} ${className}`} {...rest}>
      {children}
    </button>
  );
}

interface LinkButtonProps {
  children: ReactNode;
  href: string;
  variant?: 'solid' | 'ghost';
  external?: boolean;
}

export function LinkButton({ children, href, variant = 'ghost', external = true }: LinkButtonProps) {
  return (
    <a
      className={`btn btn--${variant}`}
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  );
}
