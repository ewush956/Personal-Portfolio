import { useEffect, useMemo, useRef, useState } from 'react';
import type { GraphNode } from './types';

interface GraphSearchProps {
  nodes: GraphNode[];
  onPick: (node: GraphNode) => void;
  /** Every id matching the query, or null when idle — drives canvas dimming. */
  onMatches: (ids: Set<number> | null) => void;
}

const MAX_RESULTS = 10;

/**
 * Global search over every note title.
 *
 * Ranked so exact and prefix matches beat mid-word ones, and — within a tier —
 * the index and course nodes come first, since a search for "crypto" almost
 * always means the course rather than one of its concept notes.
 */
export function GraphSearch({ nodes, onPick, onMatches }: GraphSearchProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const kindRank = { index: 0, course: 1, note: 2 } as const;
    return nodes
      .map((n) => {
        const t = n.title.toLowerCase();
        const at = t.indexOf(q);
        if (at === -1) return null;
        const tier = t === q ? 0 : at === 0 ? 1 : 2;
        return { n, tier, at };
      })
      .filter((r): r is { n: GraphNode; tier: number; at: number } => r !== null)
      .sort(
        (a, b) =>
          a.tier - b.tier ||
          kindRank[a.n.kind] - kindRank[b.n.kind] ||
          b.n.degree - a.n.degree ||
          a.n.title.length - b.n.title.length,
      )
      .map((r) => r.n);
  }, [query, nodes]);

  // The dropdown shows a handful; the canvas lights all of them.
  const results = useMemo(() => matches.slice(0, MAX_RESULTS), [matches]);

  useEffect(() => {
    onMatches(matches.length ? new Set(matches.map((n) => n.id)) : null);
  }, [matches, onMatches]);

  // Leaving the page (or the component) must not strand the graph in a dimmed
  // state with no visible query driving it.
  useEffect(() => () => onMatches(null), [onMatches]);

  useEffect(() => setActive(0), [query]);

  // "/" focuses search from anywhere, the way it does in most graph tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Clicking away closes the result list without clearing what was typed.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, []);

  const choose = (node: GraphNode) => {
    onPick(node);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="graph-search" ref={boxRef}>
      <input
        ref={inputRef}
        type="search"
        className="graph-search__input"
        placeholder="Search notes…  /"
        value={query}
        aria-label="Search notes"
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
      />

      {open && results.length > 0 && (
        <ul className="graph-search__results">
          {results.map((n, i) => (
            <li key={n.id}>
              <button
                type="button"
                className={`graph-search__hit${i === active ? ' is-active' : ''}`}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(n)}
                onMouseEnter={() => setActive(i)}
              >
                <span className="graph-search__title">{n.title}</span>
                <span className="graph-search__meta">
                  {n.kind === 'note' ? (n.topic ?? 'note') : n.kind}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && query.trim().length >= 2 && results.length === 0 && (
        <ul className="graph-search__results">
          <li className="graph-search__empty">No notes match “{query.trim()}”.</li>
        </ul>
      )}
    </div>
  );
}
