import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTheme } from '../themes/useTheme';
import { GraphRenderer } from './renderer';
import { readPalette } from './palette';
import { GRAPH_STATS } from '../data/graphStats';
import { GraphSearch } from './GraphSearch';
import { GraphLegend } from './GraphLegend';
import { GraphMenu } from './GraphMenu';
import { ArrowLeftIcon } from '../components/icons';
import type { LabelMode } from './renderer';
import type { GraphData, GraphNode } from './types';
import './GraphPage.css';

// Split again inside the route: the markdown + KaTeX stack is larger than the
// graph itself, and nobody needs it until they open a note.
const NotePanel = lazy(() => import('./NotePanel'));

/**
 * The chrome covering the canvas when a note is open.
 *
 * Used for the landing view too, where nothing is open yet: reserving the
 * panel's space up front is what lets the first click on "Start here" leave the
 * camera exactly where it already was.
 */
function panelInset(fullscreen: boolean) {
  const wide = window.innerWidth > 720;
  return {
    right: fullscreen ? 0 : wide ? Math.min(560, window.innerWidth * 0.92) : 0,
    bottom: fullscreen ? 0 : wide ? 0 : window.innerHeight * 0.62,
  };
}

export default function GraphPage() {
  const { themeId } = useTheme();
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<GraphNode | null>(null);

  const { slug } = useParams();
  const navigate = useNavigate();

  // Held in a ref so the renderer effect below can call it without listing it
  // as a dependency: rebuilding the renderer on every note navigation would
  // throw away the reader's camera and re-attach every listener.
  const navRef = useRef(navigate);
  navRef.current = navigate;

  // Title of the note currently open, so clicking a node while reading records
  // what we're leaving — the panel's back button reads this off router state.
  const openTitleRef = useRef<string | undefined>(undefined);

  // The open note lives in the URL, so every note is a shareable link and
  // back/forward walks the reading trail the way Obsidian's does.
  const openNote = useMemo(
    () => (slug ? (data?.nodes.find((n) => n.slug === slug) ?? null) : null),
    [slug, data],
  );

  // What the graph highlights, which outlives the panel being open.
  //
  // Nothing is lit on arrival — the whole graph reads at full strength until
  // you pick something. After that it follows the last note you opened, so
  // closing the panel leaves the neighbourhood you were reading lit where
  // you're actually looking rather than dropping it the moment the panel goes.
  const [lastFocusId, setLastFocusId] = useState<number | null>(null);
  useEffect(() => {
    openTitleRef.current = openNote?.title;
    if (openNote) setLastFocusId(openNote.id);
  }, [openNote]);

  const selected = useMemo(() => {
    if (openNote) return openNote;
    if (!data || lastFocusId === null) return null;
    return data.nodes[lastFocusId] ?? null;
  }, [openNote, data, lastFocusId]);

  const [enabledTopics, setEnabledTopics] = useState<Set<string>>(new Set());
  const [showCourses, setShowCourses] = useState(true);
  // Courses by default: at the opening view it's the only mode that names
  // anything useful without burying the graph in note titles.
  const [labelMode, setLabelMode] = useState<LabelMode>('courses');
  const [fullscreen, setFullscreen] = useState(false);
  // Everything on once the topic list is known.
  useEffect(() => {
    if (data) setEnabledTopics(new Set(data.topics.map((t) => t.id)));
  }, [data]);

  const allTopicsOn = data ? enabledTopics.size === data.topics.length : true;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GraphRenderer | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Versioned by the sync's own build id, so a cached response can never be
    // reused across a re-sync — including a poisoned one, where an interrupted
    // sync let the SPA fallback answer this URL with index.html.
    fetch(`/graph/graph.json?v=${GRAPH_STATS.buildId}`, { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`graph.json returned ${r.status}`);
        // Guard the content type explicitly: without it a stray HTML response
        // surfaces as "Unexpected token '<'", which says nothing useful.
        const type = r.headers.get('content-type') ?? '';
        if (!type.includes('json')) {
          throw new Error(
            'graph.json came back as HTML. Run `npm run graph:sync`, then hard-reload.',
          );
        }
        return r.json() as Promise<GraphData>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load graph');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Renderer lifecycle. Created once the data and canvas both exist, and torn
  // down on unmount so the RAF loop never outlives the page.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!data || !canvas) return;

    // No simulation. The layout is solved at build time and the courses are
    // pinned onto their spiral there, so the shipped coordinates are the final
    // ones — running d3-force again at load could only reproduce them, at the
    // cost of a worker, a physics dependency in the bundle and a hot CPU on a
    // phone. Nodes are fixed; the camera is what moves.
    const renderer = new GraphRenderer(canvas, data, readPalette(data.topics), {
      onHover: setHovered,
      onSelect: (node) =>
        navRef.current(`/graph/${node.slug}`, {
          state: openTitleRef.current ? { fromTitle: openTitleRef.current } : undefined,
        }),
    });
    rendererRef.current = renderer;

    // The landing camera. Set here rather than left to the constructor's fit()
    // so it uses the same framing "Start here" does, panel space included.
    renderer.surveyFrame(panelInset(false));

    // Deliberately only resize and redraw: re-framing here would throw away a
    // pan or zoom the reader had made, and the whole point of the camera rules
    // above is that their view is the one that holds. Reset re-frames on demand.
    const ro = new ResizeObserver(() => {
      renderer.resize();
      renderer.draw();
    });
    ro.observe(canvas);

    return () => {
      ro.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [data]);

  // Re-read the palette on theme change. The canvas can't inherit CSS
  // variables, so this is what makes the graph re-skin with the rest of the site.
  useEffect(() => {
    if (!data) return;
    rendererRef.current?.setPalette(readPalette(data.topics));
  }, [themeId, data]);

  const handleMatches = useCallback((ids: Set<number> | null) => {
    rendererRef.current?.setSearchMatches(ids);
  }, []);

  const handleReset = useCallback(() => {
    rendererRef.current?.surveyFrame(panelInset(false));
    setLastFocusId(null);
    navigate('/graph');
  }, [navigate]);

  useEffect(() => {
    // null means "no topic filter", which skips the per-node check on every draw.
    rendererRef.current?.setFilter(allTopicsOn ? null : enabledTopics, showCourses);
  }, [enabledTopics, allTopicsOn, showCourses, data]);

  // `data` is in the deps because the renderer doesn't exist until the graph
  // has loaded. Keyed on labelMode alone, this ran once against a null ref and
  // never again — so the default mode was silently never applied and the
  // renderer sat on its own built-in default.
  useEffect(() => {
    rendererRef.current?.setLabelMode(labelMode);
  }, [labelMode, data]);

  // Frame the open note, including on a cold load of /graph/<slug>. The panel
  // covers a chunk of the canvas, so tell the renderer where it is.
  useEffect(() => {
    rendererRef.current?.setSelected(selected);
  }, [selected]);

  useEffect(() => {
    const selected = openNote;
    if (!selected) return;

    // Only "Start here" moves the camera.
    //
    // Every other node used to be framed on open, which meant the view jumped
    // on every click — you'd get your bearings, open something, and land
    // somewhere else at a different zoom. Now the reader's own pan and zoom is
    // the one that holds: opening a note lights it up and fills the panel, and
    // the graph stays exactly where it was put. "Start here" is the deliberate
    // exception, because it is a survey rather than a destination.
    if (selected.kind !== 'index') return;

    // The same framing the landing view already uses, so opening the index
    // turns the course labels on without moving the camera at all.
    rendererRef.current?.surveyFrame(panelInset(fullscreen));
  }, [openNote, fullscreen]);

  if (error) {
    return (
      <div className="graph-page graph-page--error">
        <p>The graph could not be loaded ({error}).</p>
        <a href="/">Back to the site</a>
      </div>
    );
  }

  const readout = hovered ?? selected;

  return (
    <div
      className={
        `graph-page${openNote ? ' graph-page--reading' : ''}` +
        `${openNote && fullscreen ? ' graph-page--fullscreen' : ''}`
      }
    >
      <canvas ref={canvasRef} className="graph-canvas" />

      <header className="graph-chrome graph-chrome--top">
        <a className="graph-back" href="/#education" aria-label="Back to the site">
          <ArrowLeftIcon />
          <span className="graph-btn__long">Back</span>
        </a>
        <div className="graph-title">
          <h1>Computer Science</h1>
          {data && (
            <p>
              {data.nodes.length.toLocaleString()} notes ·{' '}
              {data.edges.length / 2} links
            </p>
          )}
        </div>
        <div className="graph-chrome__tools">
          {data && (
            <GraphSearch
              nodes={data.nodes}
              onPick={(n) => navigate(`/graph/${n.slug}`)}
              onMatches={handleMatches}
            />
          )}
          <GraphMenu onReset={handleReset} labelMode={labelMode} onLabelMode={setLabelMode} />
        </div>
      </header>

      {readout && (
        <aside className="graph-readout">
          <span className={`graph-readout__kind graph-readout__kind--${readout.kind}`}>
            {readout.kind === 'note' ? (readout.topic ?? 'note') : readout.kind}
          </span>
          <strong>{readout.title}</strong>
          <span className="graph-readout__meta">{readout.degree} connections</span>
        </aside>
      )}

      {openNote && data && (
        <Suspense fallback={null}>
          <NotePanel
            slug={openNote.slug}
            data={data}
            fullscreen={fullscreen}
            onToggleFullscreen={() => setFullscreen((v) => !v)}
            onClose={() => navigate('/graph')}
          />
        </Suspense>
      )}

      {data && (
        <GraphLegend
          topics={data.topics}
          nodes={data.nodes}
          enabled={enabledTopics}
          showCourses={showCourses}
          onToggleCourses={() => setShowCourses((v) => !v)}
          onToggle={(id) =>
            setEnabledTopics((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onAll={(on) => setEnabledTopics(on ? new Set(data.topics.map((t) => t.id)) : new Set())}
        />
      )}

      {/* A canvas is invisible to screen readers and crawlers. This mirrors the
          structure as real links, and doubles as the no-JS fallback. */}
      {data && (
        <nav className="graph-a11y" aria-label="Course index">
          <h2>Courses</h2>
          <ul>
            {data.nodes
              .filter((n) => n.kind === 'course')
              .map((n) => (
                <li key={n.id}>
                  <a href={`/graph/${n.slug}`}>{n.title}</a>
                </li>
              ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
