import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { remarkWikilink } from './remarkWikilink';
import { remarkCallout } from './remarkCallout';
import { useRef } from 'react';
import { ArrowLeftIcon } from '../components/icons';
import type { GraphData } from './types';
import 'katex/dist/katex.min.css';
import './NotePanel.css';

interface Note {
  title: string;
  slug: string;
  path: string;
  tags: string[];
  body: string;
}

interface NotePanelProps {
  slug: string;
  data: GraphData;
  /** Cover the whole viewport instead of sitting beside/over the graph. */
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onClose: () => void;
}

/** Router state we attach when one note leads to another. */
interface NoteNavState {
  /** Title of the note we came from, for the back button's tooltip. */
  fromTitle?: string;
}

export default function NotePanel({
  slug,
  data,
  fullscreen,
  onToggleFullscreen,
  onClose,
}: NotePanelProps) {
  const location = useLocation();
  const from = (location.state as NoteNavState | null)?.fromTitle;
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);

  // On a phone the sheet covers most of the screen, and the only way out was a
  // small ✕ that closed the note entirely. Collapsing to the header instead
  // keeps your place while handing the graph back.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCollapsed(false), [slug]);

  // The sheet follows your finger while you drag, rather than jumping between
  // two states when you let go. `dragHeight` is the live height in pixels; it's
  // cleared on release so the CSS class takes the height back over and animates
  // to its snap point.
  const sheetRef = useRef<HTMLElement>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ y: number; h: number; moved: number } | null>(null);

  const limits = useCallback(() => {
    // `min`/`max` bound the drag; `open` is where the sheet rests when
    // expanded, and it — not `max` — is what the snap decision compares
    // against. Using the midpoint of the full drag range meant dragging up from
    // collapsed to well past the open height still snapped shut, because the
    // range's midpoint sits above the open height.
    const min = 64;
    const open = Math.round(window.innerHeight * 0.62);
    const max = Math.round(window.innerHeight * 0.9);
    return { min, open, max };
  }, []);

  const onHandleDown = useCallback((e: React.PointerEvent) => {
    const h = sheetRef.current?.getBoundingClientRect().height ?? 0;
    drag.current = { y: e.clientY, h, moved: 0 };
    setDragHeight(h);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onHandleMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dy = d.y - e.clientY; // up is positive, and up means taller
      d.moved = Math.max(d.moved, Math.abs(dy));
      const { min, max } = limits();
      setDragHeight(Math.max(min, Math.min(max, d.h + dy)));
    },
    [limits],
  );

  const onHandleUp = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      if (!d) return;

      // A press that barely travelled is a tap: toggle. Otherwise snap to
      // whichever end the sheet finished nearer.
      const dy = d.y - e.clientY; // up is positive

      if (d.moved < 8) {
        // A tap, not a drag.
        setCollapsed((c) => !c);
      } else if (Math.abs(dy) > 40) {
        // A deliberate drag goes where it was pushed. Deciding purely on where
        // the sheet ended up means a long downward drag that stops just above
        // the midpoint springs back open, which feels like the gesture was
        // ignored.
        setCollapsed(dy < 0);
      } else {
        const { min, open, max } = limits();
        const h = Math.max(min, Math.min(max, d.h + dy));
        setCollapsed(h < (min + open) / 2);
      }
      setDragHeight(null);
    },
    [limits],
  );

  // Title and alias → slug, built once. The build script already assigned the
  // slugs, so links resolve by lookup rather than by re-deriving them here.
  const resolve = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of data.nodes) map.set(n.title.toLowerCase(), n.slug);
    return (target: string) => map.get(target.toLowerCase()) ?? null;
  }, [data]);

  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setNote(null);
    setError(null);

    fetch(`/graph/notes/${slug}.json?v=${data.buildId}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<Note>;
      })
      .then((n) => !cancelled && setNote(n))
      .catch(() => {
        // Name the slug: if this ever fires it is almost always a stale
        // graph.json pointing at a note that has since been renamed.
        if (!cancelled) setError(`No note file for “${slug}”. Try a hard reload.`);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, data.buildId]);

  // Escape closes, matching the modal convention already used on the site.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const plugins = useMemo(
    () => [remarkGfm, remarkMath, remarkCallout, [remarkWikilink, { resolve }] as const],
    [resolve],
  );

  return (
    <aside
      ref={sheetRef}
      className={
        `note-panel${collapsed ? ' note-panel--collapsed' : ''}` +
        `${fullscreen ? ' note-panel--fullscreen' : ''}` +
        `${dragHeight !== null ? ' note-panel--dragging' : ''}`
      }
      style={dragHeight !== null ? { height: `${dragHeight}px` } : undefined}
      aria-label={note?.title ?? 'Note'}
    >
      {/* Mobile only; a grab bar is the affordance people look for. */}
      <button
        type="button"
        className="note-panel__handle"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        aria-label={collapsed ? 'Expand note' : 'Collapse note'}
        aria-expanded={!collapsed}
      >
        <span aria-hidden="true" />
      </button>

      <header className="note-panel__head">
        <div className="note-panel__heading">
          <h2>{note?.title ?? (error ? 'Not found' : 'Loading…')}</h2>
          {note && <p className="note-panel__path">{note.path}</p>}
        </div>
        <div className="note-panel__actions">
          {/* Only rendered when this note was reached from another one, so it
              can never walk you off the graph page entirely. */}
          {from && (
            <button
              type="button"
              className="note-panel__btn"
              onClick={() => navigate(-1)}
              aria-label={`Back to ${from}`}
              title={`Back to ${from}`}
            >
              <ArrowLeftIcon />
            </button>
          )}
          {/* Always present: full screen is a property of how you're reading
              this note, so it belongs on the note, not buried in a view menu.
              It's also the only way back out once the graph chrome is hidden. */}
          <button
            type="button"
            className="note-panel__btn note-panel__btn--fullscreen"
            onClick={onToggleFullscreen}
            aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
            title={fullscreen ? 'Exit full screen' : 'Full screen'}
            aria-pressed={fullscreen}
          >
            {fullscreen ? '⤡' : '⤢'}
          </button>
          <button
            type="button"
            className="note-panel__btn"
            onClick={onClose}
            aria-label="Close note"
            title="Close"
          >
            ✕
          </button>
        </div>
      </header>

      {note && note.tags.length > 0 && (
        <ul className="note-panel__tags">
          {note.tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}

      <div className="note-panel__body">
        {error && <p className="note-panel__error">{error}</p>}
        {note && (
          <ReactMarkdown
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            remarkPlugins={plugins as any}
            rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: false, ignoreMissing: true }]]}
            components={{
              a({ href, children, ...rest }) {
                // Internal wikilinks navigate the graph in place; anything else
                // is an ordinary outbound link.
                if (href?.startsWith('/graph/')) {
                  return (
                    <a
                      href={href}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(href, { state: { fromTitle: note.title } });
                      }}
                      {...rest}
                    >
                      {children}
                    </a>
                  );
                }
                return (
                  <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
                    {children}
                  </a>
                );
              },
            }}
          >
            {note.body}
          </ReactMarkdown>
        )}
      </div>
    </aside>
  );
}
