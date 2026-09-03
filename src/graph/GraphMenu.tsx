import { useEffect, useRef, useState } from 'react';
import type { LabelMode } from './renderer';

interface GraphMenuProps {
  onReset: () => void;
  labelMode: LabelMode;
  onLabelMode: (mode: LabelMode) => void;
}

const LABEL_OPTIONS: { value: LabelMode; label: string; hint: string }[] = [
  { value: 'auto', label: 'Automatic', hint: 'Names appear as you zoom and select' },
  { value: 'courses', label: 'Courses only', hint: 'Every course named, nothing else' },
  { value: 'none', label: 'None', hint: 'Just the shape' },
];

/**
 * The view menu.
 *
 * Replaces a lone "Reset view" button: the controls that change how the graph
 * is displayed — rather than what it shows, which is the legend's job — now
 * live together behind one control instead of each claiming space in a bar
 * that has none to spare on a phone.
 */
export function GraphMenu({ onReset, labelMode, onLabelMode }: GraphMenuProps) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="graph-menu" ref={boxRef}>
      <button
        type="button"
        className="graph-btn graph-menu__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="View options"
        aria-expanded={open}
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>

      {open && (
        <div className="graph-menu__panel" role="menu">
          <button
            type="button"
            className="graph-menu__item"
            role="menuitem"
            onClick={() => {
              onReset();
              setOpen(false);
            }}
          >
            Reset view
          </button>

          <div className="graph-menu__group" role="group" aria-label="Labels">
            <span className="graph-menu__label">Labels</span>
            {LABEL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`graph-menu__item graph-menu__item--radio${
                  labelMode === opt.value ? ' is-active' : ''
                }`}
                role="menuitemradio"
                aria-checked={labelMode === opt.value}
                onClick={() => {
                  onLabelMode(opt.value);
                  setOpen(false);
                }}
              >
                <span>
                  {opt.label}
                  <em>{opt.hint}</em>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
