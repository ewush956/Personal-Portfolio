import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTheme } from '../themes/useTheme';
import { useRailCollapsed } from '../hooks/useRailCollapsed';
import { NavRail } from '../components/NavRail';
import { ThemeChips } from '../components/ThemeChips';
import { GraphRenderer } from './renderer';
import { readPalette } from './palette';
import { GRAPH_STATS } from '../data/graphStats';
import { GraphSearch } from './GraphSearch';
import { GraphLegend } from './GraphLegend';
import { GraphMenu } from './GraphMenu';
import type { LabelMode } from './renderer';
import { SHEET_OPEN, SHEET_SHUT } from './layout';
import type { GraphData, GraphNode } from './types';
import './GraphPage.css';

// Split again inside the route: the markdown + KaTeX stack is larger than the
// graph itself, and nobody needs it until they open a note.
const NotePanel = lazy(() => import('./NotePanel'));

/** Below this viewport width the page is treated as a phone. Matches NARROW in
    the renderer, which decides what gets labelled. */
const NARROW = 720;

/** How often the graph re-frames while the sheet is being dragged, in ms. */
const DRAG_FRAME_MS = 90;

/**
 * The chrome covering the canvas.
 *
 * `top` is the shell's header, which is over the canvas on every view — the
 * only part of the inset that is not about the reading panel. The rail is
 * deliberately absent: it sits beside the canvas rather than over it, so it is
 * already out of the measured width.
 *
 * The panel's own numbers are computed from the *viewport*, not the canvas,
 * because that is what the CSS behind them uses — `min(560px, 92vw)` for the
 * rail and `60vh` for the phone's sheet are both resolved against the window.
 *
 * Applied to the landing view too, where nothing is open yet: reserving the
 * panel's space up front is what lets the first click on "Start here" leave the
 * camera exactly where it already was.
 */
function panelInset(
  fullscreen: boolean,
  sheet: number | null,
  top: number,
  sheetShut: boolean,
  reading: boolean,
  legend: number,
) {
  const wide = window.innerWidth > NARROW;
  return {
    // Full screen hides the header along with the rest of the chrome.
    top: fullscreen ? 0 : top,
    right: fullscreen ? 0 : wide ? Math.min(560, window.innerWidth * 0.92) : 0,
    bottom: fullscreen
      ? 0
      : wide
        ? 0
        : !reading
          ? // Nothing open: the sheet is gone and the only thing between the
            // graph and the bottom edge is the topic list, which on a phone is
            // a full-width bar. Reserving the sheet's height anyway left the
            // graph pinned in a strip under the header with a band of empty
            // canvas between it and the list — on the one screen a reader
            // reaches by deliberately closing the note to look at the graph.
            legend
          : // A shut sheet covers its header and nothing else, whatever height
            // it rests at when open — and that height is deliberately kept, so
            // it cannot be read as what the sheet currently occupies.
            sheetShut
            ? SHEET_SHUT
            : (sheet ?? window.innerHeight * SHEET_OPEN),
  };
}

export default function GraphPage() {
  const { themeId } = useTheme();
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Hover state lives in `GraphReadout`, not here. Moving the cursor over the
     canvas changes the hovered node many times a second, and holding that in
     this component re-rendered the whole page on every one of them — search,
     legend, the course list, and the open note with its rendered markdown.
     The readout is the only thing that reads it, so it is the only thing that
     re-renders. The renderer pushes hovers through this ref. */
  const hoverRef = useRef<(node: GraphNode | null) => void>(() => {});

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

  // On a phone the index opens on arrival.
  //
  // The graph is an overview there, not the way you navigate — reading happens
  // in the sheet, and the sheet starting empty made the whole route look like a
  // decorative blob you had to guess your way into. Desktop still lands on the
  // graph itself, where "Start here" is legible and clickable.
  //
  // Once only, and via replace, so it doesn't sit in the history and closing
  // the sheet doesn't immediately reopen it.
  //
  // On mount, not on `data`. The index's slug is known at build time, so this
  // does not need graph.json — and waiting for it made the phone's arrival
  // lurch. The renderer is built in the same commit the data lands in and
  // frames itself immediately; with the redirect one commit behind, that first
  // framing was computed for a page with no note open — the bottom of the band
  // being the topic list — and the redirect then re-framed it for the sheet, a
  // different zoom, one commit later. Redirecting first means `slug` is already
  // set when the data arrives, so the first frame is the final one.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (slug || autoOpened.current) return;
    if (window.innerWidth > NARROW) return;
    autoOpened.current = true;
    navigate(`/graph/${GRAPH_STATS.indexSlug}`, { replace: true });
  }, [slug, navigate]);

  /* Which topics are shown, or null while the reader has not touched the
     filter — which is every topic.

     The distinction matters because an *empty* set is a real state: turning
     everything off in the legend is allowed, and it means "show nothing". This
     used to start as an empty set and get filled in by an effect once the data
     arrived, so for one commit after the load "nothing chosen yet" and "the
     reader turned everything off" were the same value, and the renderer was
     handed a filter that matched no node. The graph blinked empty and then
     filled in. */
  const [enabledTopics, setEnabledTopics] = useState<Set<string> | null>(null);
  const [showCourses, setShowCourses] = useState(true);
  // Courses by default: at the opening view it's the only mode that names
  // anything useful without burying the graph in note titles.
  const [labelMode, setLabelMode] = useState<LabelMode>('courses');
  const [fullscreen, setFullscreen] = useState(false);

  /* The panel shrunk to its header. Held here rather than inside the panel
     because collapsing has to uncover the topic filter, which is the panel's
     sibling — CSS can't reach up out of the panel to reveal it. */
  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(false);
  collapsedRef.current = collapsed;

  /* The height the phone's sheet has been dragged to. Also held here: it
     outlives the note it was set on, and the graph frames itself against it,
     so pulling the sheet down really does buy canvas rather than just
     uncovering it. Deliberately *not* cleared when the note changes — a
     reader who made room to see the graph keeps that room while they browse.
     `inset` reads it through a ref so the callbacks below stay stable and the
     renderer isn't rebuilt on a resize. */
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);
  const sheetRef = useRef<number | null>(null);
  sheetRef.current = sheetHeight;

  /* The sheet's height mid-drag, which outranks the resting one while a finger
     is down and is null the rest of the time. A ref, not state: the whole point
     is that following the drag must not re-render this page sixty times a
     second. */
  const liveSheetRef = useRef<number | null>(null);

  /* The shell's top bar is opaque, so the camera has to know how tall it is.
     Measured rather than hard-coded: it holds the search field, the theme
     swatches and the menu, and its height moves with --control-h, the theme's
     type scale and whether the stats line is shown. Kept in a ref for the same
     reason the sheet height is — `inset` must stay referentially stable or the
     renderer is torn down and rebuilt on every resize. The state alongside it
     exists only to re-run the effects that re-apply the inset. */
  const topRef = useRef(0);
  const [topBarH, setTopBarH] = useState(0);
  const barRef = useRef<HTMLElement>(null);

  /* What the topic list covers along the bottom, measured the same way and for
     the same reason as the bar above. Zero while it is hidden — which on a
     phone is whenever a note is open — because a hidden element covers nothing
     and `getBoundingClientRect` says so. */
  const legendRef = useRef(0);
  const [legendH, setLegendH] = useState(0);
  const legendBoxRef = useRef<HTMLElement>(null);

  /* Whether a note is open, for the inset. A ref because `inset` has to stay
     referentially stable — see the sheet height above. */
  const readingRef = useRef(false);
  readingRef.current = openNote !== null;

  const inset = useCallback(
    (full: boolean) =>
      panelInset(
        full,
        liveSheetRef.current ?? sheetRef.current,
        topRef.current,
        // Mid-drag the sheet is at the height under the finger, shut or not.
        collapsedRef.current && liveSheetRef.current === null,
        readingRef.current,
        legendRef.current,
      ),
    [],
  );

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const measure = () => {
      const h = bar.getBoundingClientRect().height;
      topRef.current = h;
      setTopBarH(h);
    };
    // Measured once up front as well: the renderer is created in a later effect
    // and frames itself immediately, so the height has to be known by then
    // rather than one observer callback afterwards.
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  /* `data` in the deps because the list is not rendered until the graph has
     loaded, so there is nothing to observe before then. */
  useEffect(() => {
    const box = legendBoxRef.current;
    if (!box) return;
    const measure = () => {
      const r = box.getBoundingClientRect();
      const canvas = canvasRef.current?.getBoundingClientRect();
      // From the canvas's bottom edge to the list's top, so the gap the list
      // is floated by counts as covered too — there is nothing usable in it.
      const h = r.height && canvas ? Math.max(0, canvas.bottom - r.top) : 0;
      legendRef.current = h;
      setLegendH(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [data]);

  /* Pulling the phone's sheet down closes the view in on whatever is open.
     `coverFrame` does the work — the band gets taller, its long side becomes
     the height, and the course ring is scaled to cover it — so all this has to
     do is re-frame whenever the sheet has moved. Desktop is untouched: there is
     no sheet there, and the rule that the reader's own camera is the one that
     holds still stands.

     Read through refs so the callback is stable, which is what lets the drag
     handler below hold onto it without re-rendering anything. */
  const selectedRef = useRef<GraphNode | null>(null);
  const reframeSheet = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer || window.innerWidth > NARROW) return;
    renderer.setViewInset(inset(false));
    const node = selectedRef.current;
    if (node) renderer.coverFrame(node, inset(false));
    else renderer.surveyFrame(inset(false));
  }, [inset]);

  /* Following the drag frame by frame would repaint the scene bitmap on every
     one of them — 13.7k links, and the sheet is being dragged on the same
     thread. So the camera steps rather than glides: about eleven updates a
     second, which reads as the view opening with the sheet while leaving the
     main thread most of its budget for the sheet itself. The exact frame comes
     from the effect below when the finger lifts. */
  const lastDragFrame = useRef(0);
  const handleDragHeight = useCallback(
    (px: number | null) => {
      liveSheetRef.current = px;
      if (px === null) return; // released — the resting height re-frames
      const now = performance.now();
      if (now - lastDragFrame.current < DRAG_FRAME_MS) return;
      lastDragFrame.current = now;
      reframeSheet();
    },
    [reframeSheet],
  );

  const [railCollapsed, toggleRail] = useRailCollapsed();
  const railWidth: CSSProperties = {
    ['--rail-w' as string]: railCollapsed ? '76px' : '216px',
  };

  const allTopicIds = useMemo(
    () => new Set((data?.topics ?? []).map((t) => t.id)),
    [data],
  );
  /** What the legend shows as ticked: the reader's set, or every topic until
      they have one. Materialised only when they first change it. */
  const shownTopics = enabledTopics ?? allTopicIds;
  const allTopicsOn = enabledTopics === null || !data || enabledTopics.size === data.topics.length;

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
      onHover: (node) => hoverRef.current(node),
      onSelect: (node) =>
        navRef.current(`/graph/${node.slug}`, {
          state: openTitleRef.current ? { fromTitle: openTitleRef.current } : undefined,
        }),
    });
    rendererRef.current = renderer;

    // The landing camera. Set here rather than left to the constructor's fit()
    // so it uses the same framing "Start here" does, panel space included.
    renderer.setViewInset(inset(false));
    renderer.surveyFrame(inset(false));

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
  }, [data, inset]);

  // Re-read the palette on theme change. The canvas can't inherit CSS
  // variables, so this is what makes the graph re-skin with the rest of the site.
  useEffect(() => {
    if (!data) return;
    rendererRef.current?.setPalette(readPalette(data.topics));
  }, [themeId, data]);

  const handleMatches = useCallback((ids: Set<number> | null) => {
    rendererRef.current?.setSearchMatches(ids);
  }, []);

  /* Back to the landing view: the note closed, the lit neighbourhood dropped,
     the camera re-framed. Reached from the menu and from the panel's own ✕,
     which is the same request made from the other end. Full screen goes with
     it — it's part of the view being reset, and leaving it set would open the
     next note full screen against a camera framed for a rail. */
  const handleReset = useCallback(() => {
    setFullscreen(false);
    setSheetHeight(null);
    liveSheetRef.current = null;
    // The frame below has to be computed against the chrome the page is going
    // *to*, not the chrome it is leaving — and closing the note is what hands
    // the phone's bottom band back to the topic list.
    readingRef.current = false;
    // Ordering: the frame has to be computed against the height the sheet is
    // going back to, not the one it is leaving, so clear it first — `inset`
    // reads the ref, which the line above has already updated.
    sheetRef.current = null;
    rendererRef.current?.surveyFrame(inset(false));
    setLastFocusId(null);
    navigate('/graph');
  }, [inset, navigate]);

  useEffect(() => {
    // null means "no topic filter", which skips the per-node check on every draw.
    rendererRef.current?.setFilter(allTopicsOn ? null : shownTopics, showCourses);
  }, [shownTopics, allTopicsOn, showCourses, data]);

  // `data` is in the deps because the renderer doesn't exist until the graph
  // has loaded. Keyed on labelMode alone, this ran once against a null ref and
  // never again — so the default mode was silently never applied and the
  // renderer sat on its own built-in default.
  useEffect(() => {
    rendererRef.current?.setLabelMode(labelMode);
  }, [labelMode, data]);

  // A newly opened note arrives expanded, whichever way it was opened — a node
  // on the canvas, a wikilink inside another note, or the back button.
  useEffect(() => {
    setCollapsed(false);
  }, [openNote]);

  // Frame the open note, including on a cold load of /graph/<slug>. The panel
  // covers a chunk of the canvas, so tell the renderer where it is.
  useEffect(() => {
    selectedRef.current = selected;
    rendererRef.current?.setSelected(selected);
  }, [selected]);

  /* The sheet came to rest at a new height: land the camera exactly, whatever
     the throttled drag left it on. `data` is in the deps because the renderer
     does not exist until the graph has loaded — without it the first framing
     after a cold load on a phone would run against a null ref. */
  /* Re-frame when the phone's chrome moves — the sheet dragged, collapsed, or
     closed and replaced by the topic list.

     Deliberately NOT keyed on the selection. Opening a node must not move the
     camera, here as anywhere: the reader's own view is the one that holds, and
     a graph that recentres on every tap is exactly the lurch that rule exists
     to stop. `data` is in the deps because the renderer does not exist until
     the graph has loaded. */
  useEffect(() => {
    reframeSheet();
  }, [sheetHeight, collapsed, legendH, data, reframeSheet]);

  // Keep the label bounds in step with the camera's. Both use the panel inset
  // whether or not a note is open, so nothing re-flows when the panel appears.
  useEffect(() => {
    rendererRef.current?.setViewInset(inset(fullscreen));
  }, [fullscreen, data, sheetHeight, topBarH, legendH, openNote, inset]);

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
    rendererRef.current?.surveyFrame(inset(fullscreen));
  }, [openNote, fullscreen, inset]);

  /* The rail wraps every branch below, the error page included: it is the way
     off this route now that the back button is gone, and an error is exactly
     when a visitor needs it. */
  const shell = (children: React.ReactNode) => (
    <div className="app graph-app" style={railWidth}>
      <NavRail active="graph" collapsed={railCollapsed} onToggle={toggleRail} />
      {children}
    </div>
  );

  if (error) {
    return shell(
      <div className="graph-page graph-page--error">
        <p>The graph could not be loaded ({error}).</p>
        <a href="/">Back to the site</a>
      </div>,
    );
  }

  return shell(
    <div
      className={
        `graph-page${openNote ? ' graph-page--reading' : ''}` +
        `${openNote && fullscreen ? ' graph-page--fullscreen' : ''}` +
        `${openNote && collapsed ? ' graph-page--collapsed' : ''}`
      }
    >
      <canvas ref={canvasRef} className="graph-canvas" />

      {/* The site's header, not the graph's own. It carries the same surface as
          the nav rail beside it and the theme bar on the portfolio, and the
          themes it used to take a full-width bar to offer are here in the
          condensed form the portfolio scrolls into. What replaced the back
          button is the rail: "Back" pointed at one section of one page, while
          the rail reaches every one of them. */}
      <header className="graph-chrome graph-chrome--top" ref={barRef}>
        <div className="graph-title">
          <h1>Computer Science</h1>
          {data && (
            <p>
              {data.nodes.length.toLocaleString()} notes · {data.edges.length / 2} links
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
          <ThemeChips dots />
          <GraphMenu onReset={handleReset} labelMode={labelMode} onLabelMode={setLabelMode} />
        </div>
      </header>

      <GraphReadout selected={selected} bind={hoverRef} />

      {openNote && data && (
        <Suspense fallback={null}>
          <NotePanel
            slug={openNote.slug}
            data={data}
            fullscreen={fullscreen}
            // Full screen is for reading, which is the one thing a collapsed
            // panel can't do — so entering it expands.
            onToggleFullscreen={() => {
              setFullscreen((v) => !v);
              setCollapsed(false);
            }}
            onReset={handleReset}
            collapsed={collapsed}
            onCollapse={setCollapsed}
            height={sheetHeight}
            onHeight={setSheetHeight}
            onDragHeight={handleDragHeight}
          />
        </Suspense>
      )}

      {data && (
        <GraphLegend
          topics={data.topics}
          nodes={data.nodes}
          enabled={shownTopics}
          showCourses={showCourses}
          onToggleCourses={() => setShowCourses((v) => !v)}
          onToggle={(id) =>
            setEnabledTopics((prev) => {
              const next = new Set(prev ?? allTopicIds);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onAll={(on) => setEnabledTopics(on ? new Set(data.topics.map((t) => t.id)) : new Set())}
          reading={openNote !== null}
          boxRef={legendBoxRef}
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
    </div>,
  );
}

/**
 * Names the node under the cursor, falling back to the open one.
 *
 * Its own component purely so a hover repaints this and nothing else — see the
 * note on `hoverRef` above. It registers its setter on mount; child effects run
 * before the parent's, so the renderer is never created before the sink exists.
 */
function GraphReadout({
  selected,
  bind,
}: {
  selected: GraphNode | null;
  bind: RefObject<(node: GraphNode | null) => void>;
}) {
  const [hovered, setHovered] = useState<GraphNode | null>(null);

  useEffect(() => {
    bind.current = setHovered;
    return () => {
      bind.current = () => {};
    };
  }, [bind]);

  const readout = hovered ?? selected;
  if (!readout) return null;

  return (
    <aside className="graph-readout">
      <span className={`graph-readout__kind graph-readout__kind--${readout.kind}`}>
        {readout.kind === 'note' ? (readout.topic ?? 'note') : readout.kind}
      </span>
      <strong>{readout.title}</strong>
      <span className="graph-readout__meta">{readout.degree} connections</span>
    </aside>
  );
}
