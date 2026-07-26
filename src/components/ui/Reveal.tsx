import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface RevealProps {
  children: ReactNode;
  /** Stagger index — each step delays the reveal slightly. */
  index?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
}

/**
 * Scroll-triggered reveal. Motion duration/easing follow the active theme via
 * CSS-less timing here (kept snappy); fully disabled under reduced-motion.
 */
export function Reveal({ children, index = 0, className, as = 'div' }: RevealProps) {
  const reduce = useReducedMotion();
  const MotionTag = motion[as];

  if (reduce) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.6, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionTag>
  );
}
