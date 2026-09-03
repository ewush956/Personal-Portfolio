import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { remarkWikilink } from './remarkWikilink';
import { remarkCallout } from './remarkCallout';
import { useRef } from 'react';
import { ArrowLeftIcon, ChevronDownIcon } from '../components/icons';
import type { CSSProperties } from 'react';
import type { GraphData } from './types';
import 'katex/dist/katex.min.css';
import './NotePanel.css';

interface Note {
  title: string;
  slug: string;
  path: string;
  /** Carried by the note JSON and used to bucket the node into a topic at
      build time. Not shown here: the header already names the note and where
      it lives, and the tag row was a third line of chrome above the prose. */
  tags: string[];
  body: string;
}

interface NotePanelProps {
  slug: string;
  data: GraphData;
  /** Cover the whole viewport instead of sitting beside/over the graph. */
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  /** Close the note and put the graph back the way it started. */
  onReset: () => void;
  /** Shrunk to its header. Owned by the page, which uncovers the topic filter
      behind the panel while it holds. */
  collapsed: boolean;
  onCollapse: (next: boolean) => void;
  /** The height the phone's sheet rests at, in pixels, once it has been
      dragged to one; null until then. Owned by the page so it outlives the
      note you set it on, and so the graph can frame itself against it. */
  height: number | null;
  onHeight: (px: number | null) => void;
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
  onReset,
  collapsed,
  onCollapse,
  height,
  onHeight,
}: NotePanelProps) {
  const location = useLocation();
  const from = (location.state as NoteNavState | null)?.fromTitle;
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Collapsing hides the body with `display: none`, and a hidden element
  // forgets where it was scrolled to. So the offset is saved on the way down
  // and put back on the way up: bringing the panel back returns you to the
  // paragraph you left, not to the top of the note.
  const bodyRef = useRef<HTMLDivElement>(null);
  const keptScroll = useRef(0);

  const collapse = useCallback(
    (next: boolean) => {
      if (next) keptScroll.current = bodyRef.current?.scrollTop ?? 0;
      onCollapse(next);
    },
    [onCollapse],
  );

  useLayoutEffect(() => {
    // Before paint, so the restored position is never seen scrolling into place.
    if (!collapsed && bodyRef.current) bodyRef.current.scrollTop = keptScroll.current;
  }, [collapsed]);

  // A different note starts at its own top. Expanding it again is the page's
  // job, since it holds the collapsed state.
  useEffect(() => {
    keptScroll.current = 0;
  }, [slug]);

  // The sheet follows your finger while you drag, rather than jumping between
  // two states when you let go — and where you let go is where it stays. The
  // height is the reader's to set: pull it down to see more of the graph and
  // it keeps that height, through this note and the next one.
  //
  // `dragHeight` is the live height, held locally so a drag repaints this
  // component and not the page. It's handed up on release and then cleared,
  // and the resting height takes over from there.
  const sheetRef = useRef<HTMLElement>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ y: number; h: number; moved: number } | null>(null);

  const limits = useCallback(() => {
    // The floor is the collapsed header. `shut` is the last stretch above it:
    // let go inside that band and the sheet finishes the job and collapses,
    // rather than resting at a height that shows two lines of a paragraph.
    const min = 64;
    return {
      min,
      shut: min + 56,
      max: Math.round(window.innerHeight * 0.9),
    };
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

      // A press that barely travelled is a tap: toggle. Anything else is a
      // resize, and it is kept — a drag that ends two thirds of the way down
      // used to spring back to full height, which read as the gesture being
      // ignored. Only the band just above the floor still snaps, because that
      // is plainly someone putting the sheet away.
      const dy = d.y - e.clientY; // up is positive

      if (d.moved < 8) {
        collapse(!collapsed);
      } else {
        const { min, shut, max } = limits();
        const h = Math.max(min, Math.min(max, d.h + dy));
        if (h <= shut) {
          // Collapsing deliberately leaves the resting height alone, so
          // bringing the sheet back brings back the size you chose.
          collapse(true);
        } else {
          onHeight(h);
          collapse(false);
        }
      }
      setDragHeight(null);
    },
    [collapse, collapsed, limits, onHeight],
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

  // Escape closes, matching the modal convention already used on the site. It
  // is the same gesture the ✕ is, so it does the same thing: the note goes and
  // the graph is put back where it started.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onReset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onReset]);

  // The live height while a finger is down, the resting one otherwise, and
  // nothing at all until the reader has set one — the stylesheet's default
  // stands in until then.
  const live = dragHeight ?? height;

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
      /* A custom property rather than an inline `height`, because this height
         is the phone sheet's alone — the CSS reads it inside the phone's media
         query, so a height dragged on a phone can't turn the desktop rail into
         a 300px box when the window is widened. */
      style={{ '--sheet-h': live === null ? undefined : `${live}px` } as CSSProperties}
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
          {/* Two different exits, and the pair is the point. Collapsing hands
              the graph back — and on a wide screen the topic filter behind the
              rail — while the note and your place in it survive, with the
              header as the way back up. ✕ is the other end: you're done here,
              so the note goes and the graph returns to the view it opened
              with. */}
          <button
            type="button"
            className="note-panel__btn note-panel__btn--collapse"
            onClick={() => collapse(!collapsed)}
            aria-label={collapsed ? 'Expand note' : 'Collapse note'}
            title={collapsed ? 'Expand' : 'Collapse'}
            aria-expanded={!collapsed}
          >
            <ChevronDownIcon />
          </button>
          <button
            type="button"
            className="note-panel__btn note-panel__btn--close"
            onClick={onReset}
            aria-label="Close note and reset the view"
            title="Close and reset the view"
          >
            ✕
          </button>
        </div>
      </header>

      <div className="note-panel__body" ref={bodyRef}>
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
