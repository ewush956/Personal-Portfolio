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

  /* Bumped every time the *reader* moves the sheet — a drag come to rest, a
     collapse, an expand from the header — and by nothing else. It is what the
     phone's re-framing effect is keyed on; see there for why the sheet's own
     height and collapsed flag are not enough. A counter rather than a flag so
     a gesture that lands on the height it started from still frames. */
  const [sheetMove, setSheetMove] = useState(0);
  const moveSheet = useCallback(() => setSheetMove((n) => n + 1), []);

  const handleSheetHeight = useCallback(
    (px: number | null) => {
      moveSheet();
      setSheetHeight(px);
    },
    [moveSheet],
  );

  const handleCollapse = useCallback(
    (next: boolean) => {
      moveSheet();
      setCollapsed(next);
    },
    [moveSheet],
  );

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

  /* The height the list had while it was last on screen. The live measurement
     above drops to zero the moment a note opens, and closing that note has to
     be framed against the band the list is about to take *back* — which is
     this, because the reset runs a commit before the list is on screen again
     to be measured. */
  const legendShownRef = useRef(0);

  /* Whether a note is open, for the inset. A ref because `inset` has to stay
     referentially stable — see the sheet height above. */
  const readingRef = useRef(false);
  readingRef.current = openNote !== null;

  /* What the phone's camera frames on, for the same reason. Mirrored during
     render rather than in an effect so a drag reads the current node even
     mid-gesture, without `reframeSheet` having to depend on it. */
  const selectedRef = useRef<GraphNode | null>(null);
  selectedRef.current = selected;

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

  /* Pulling the phone's sheet down closes the view in on whatever is open.
     `coverFrame` does the work — the band gets taller, its long side becomes
     the height, and the course ring is scaled to cover it — so all this has to
     do is re-frame whenever the sheet has moved. Desktop is untouched: there is
     no sheet there, and the rule that the reader's own camera is the one that
     holds still stands.

     Read through refs so the callback is stable, which is what lets the drag
     handler below hold onto it without re-rendering anything. */
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

  /* `data` in the deps because the list is not rendered until the graph has
     loaded, so there is nothing to observe before then. Declared after
     `reframeSheet` so it can hold it as a dependency. */
  useEffect(() => {
    const box = legendBoxRef.current;
    if (!box) return;
    const measure = () => {
      const r = box.getBoundingClientRect();
      const canvas = canvasRef.current?.getBoundingClientRect();
      // From the canvas's bottom edge to the list's top, so the gap the list
      // is floated by counts as covered too — there is nothing usable in it.
      const h = r.height && canvas ? Math.max(0, canvas.bottom - r.top) : 0;
      const unseen = legendShownRef.current === 0;
      legendRef.current = h;
      if (h) legendShownRef.current = h;
      setLegendH(h);
      /* The one measurement that re-frames, and only on a phone with nothing
         open. Normally the list is measured before the renderer is built, so
         the landing camera already knows about it. A cold load of
         /graph/<slug> is the exception: the list is display:none the whole
         time the note is up, so it has never had a height, and the reset that
         closes the note frames against a zero `legendShownRef`. This is that
         height arriving one commit later. */
      if (h && unseen && !readingRef.current) reframeSheet();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [data, reframeSheet]);

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
    //
    // The same view on a phone, which it did not used to be: the route
    // redirected to the index on arrival there, so the sheet was never empty.
    // Reading is how you navigate on a phone, and a blank sheet made the whole
    // thing look like a decorative blob you had to guess your way into. But
    // arriving inside a note hid the two things that say what this page is —
    // "Start here" on the index, and the topic list along the bottom, both of
    // them under the open sheet.
    //
    // A cold load of /graph/<slug> overwrites this a moment later, from the
    // effect that frames a note as it opens: `openNote` is already set in this
    // commit, so that counts as an opening and lands on the note.
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
    // Same reasoning for the topic list, from the other direction: it is still
    // display:none this commit, so its live height is zero and the observer
    // that puts the real one back does not run until it is on screen. Framing
    // against zero drew the graph down behind the list it was about to grow.
    legendRef.current = legendShownRef.current;
    // Nothing else about the selection moves the camera, so this and the drag
    // are the only two things that frame a phone.
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

  // Light the open note's neighbourhood, including on a cold load of
  // /graph/<slug>. The camera is a separate question — see the effect below.
  useEffect(() => {
    rendererRef.current?.setSelected(selected);
  }, [selected]);

  /* Opening the *first* note frames it. Opening the ones after it pans.
   *
   * The two are different requests. From the landing view the sheet is about
   * to rise over most of the screen, so a tap that left the camera alone would
   * put the node you just chose behind the thing you chose it to read;
   * framing is what hands back a band with that node in the middle of it, and
   * the zoom changes with it because the band it is fitting into just did.
   *
   * Once you are reading, the graph above the sheet is the map you are
   * navigating by. Re-framing it on every wikilink loses your place, but
   * holding it dead still hides the node you just asked for whenever it is off
   * the strip. `panIntoView` is the middle: the zoom never moves, and the
   * camera slides most of the way to centred for a node near the middle of the
   * spiral, hardly at all for one on its rim, and at minimum far enough that
   * the node is on screen. It is a slide rather than a cut because between two
   * views of a graph this dense a cut reads as the graph having been swapped
   * rather than as having been moved across.
   *
   * A phone only. The desktop's panel takes the right-hand third rather than
   * rising over the graph, and its own rule — the index re-surveys, nothing
   * else moves — is a few lines further down.
   */
  const wasReading = useRef(false);
  useEffect(() => {
    const reading = openNote !== null;
    const opening = reading && !wasReading.current;
    wasReading.current = reading;
    if (!reading || !openNote) return;
    if (window.innerWidth > NARROW) return;
    // The sheet arrives expanded whichever branch runs (the effect above
    // queues that), so both are computed against an open sheet rather than the
    // collapsed one this commit still reports. It matters as much for the pan
    // as for the frame: panning a node into a band the sheet is about to rise
    // over puts it on screen for as long as the expansion takes.
    collapsedRef.current = false;
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setViewInset(inset(false));
    if (opening) renderer.coverFrame(openNote, inset(false));
    else renderer.panIntoView(openNote, inset(false));
  }, [openNote, inset]);

  /* The sheet came to rest at a new height: land the camera exactly, whatever
     the throttled drag left it on.

     Driven by a counter the sheet's own handlers bump, not by the sheet's
     height and collapsed flag directly. Those two move for reasons that are
     nothing to do with the reader — a note opening expands a collapsed sheet,
     closing one hands the bottom band back to the topic list — and this effect
     used to be keyed on them, so it could not tell a drag from a tap. Every
     wikilink followed while reading re-framed the phone's camera and threw
     away wherever the reader had panned to. The counter only advances on the
     gesture itself; framing a note as it *opens* is a separate rule, above.

     `liveSheetRef` is already back to null by the time this runs: the panel
     clears it synchronously at the end of the same handler, and refs are not
     batched, so `inset` reads the resting height rather than the last frame of
     the drag. */
  useEffect(() => {
    if (!sheetMove) return;
    reframeSheet();
  }, [sheetMove, reframeSheet]);

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

    /* Not on a phone, where it is not the same framing. The exception is
       allowed on a desktop because the landing camera *is* the survey frame
       and the reading panel's space is reserved on both views, so opening the
       index only turns the course labels on. On a phone the sheet takes the
       bottom 60% as it opens, and re-surveying into the strip that leaves
       fits the whole course ring into ~135px — below `MIN_K`, which is the
       blob `coverFrame` exists to avoid. There the index is a node like any
       other: it lights up, and the camera holds. */
    if (window.innerWidth <= NARROW) return;

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
            onCollapse={handleCollapse}
            height={sheetHeight}
            onHeight={handleSheetHeight}
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
