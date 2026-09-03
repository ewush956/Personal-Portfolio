import { buildAdjacency } from './types';
import type { Adjacency, GraphData, GraphNode, GraphPalette } from './types';

/**
 * Canvas graph renderer.
 *
 * Deliberately a plain class rather than a React component: at ~840 nodes and
 * ~6.4k links, re-rendering through React on pointer move or animation frame
 * would spend the entire frame budget in reconciliation. React owns the
 * container and the surrounding UI; this owns the canvas and the RAF loop, and
 * the two talk through the callbacks below.
 */

/**
 * How much text the graph draws.
 *  - `auto`    the default: the index always, courses once you lean in, notes
 *              when lit or matched.
 *  - `courses` course names only — same zoom behaviour as `auto`, but note
 *              names never appear, however deep you go or what you select.
 *  - `none`    no text at all, for looking at the shape on its own.
 */
export type LabelMode = 'auto' | 'courses' | 'none';

/**
 * Chrome covering the canvas, in screen pixels from each edge.
 *
 * There is no `left`: the nav rail is outside the canvas element rather than
 * over it, so the rail is already gone from `this.width` by the time the
 * renderer measures anything. Everything here genuinely overlaps the drawing.
 */
export interface Inset {
  top: number;
  right: number;
  bottom: number;
}

export interface RendererCallbacks {
  onHover(node: GraphNode | null): void;
  onSelect(node: GraphNode): void;
}

/* Label thresholds, expressed as multiples of the fitted zoom rather than as
   absolute scales — "how far have you zoomed in from the starting view" is the
   question that matters, and it has to mean the same thing on a laptop and on a
   4K monitor. At the initial view only the index is named; courses appear once
   you lean in or open "Start here", notes once you're properly close. */
const LABEL_ZOOM_COURSE = 1.6;
const LABEL_ZOOM_NOTE = 4.5;
/** At or below this VIEWPORT width the layout is treated as a phone. Matches
    the `max-width: 720px` blocks in GraphPage.css and NotePanel.css, which is
    why it reads the window rather than the canvas: with the nav rail beside it
    the canvas is up to 216px narrower than the viewport, so measuring the
    canvas put the renderer on the phone path — a plain `fit()` that ignores the
    right inset — while the CSS was still showing the desktop reading panel, and
    the graph framed itself behind it. */
const NARROW = 720;

/** How far the survey view sits below the centre of the visible band, as a
    share of that band's height. Bounded below by the lowest course label, not
    by the nodes: at 0.065 the bottom row ran within ~20px of the edge on a
    1280x800, which reads as clipped.

    Cut from 0.055 when the shell's header arrived. Two things pushed the frame
    down at once: the band now starts at the bar's lower edge rather than the
    top of the screen, so centring in it is already ~half the bar's height
    lower, and the drop is measured against a band that is the bar shorter. The
    reason for any drop at all is unchanged — the note clusters hang upward off
    the spiral, so centring on the index alone leaves a band of empty canvas
    underneath — but the bar now does part of that work by taking the space off
    the top. */
const SURVEY_DROP = 0.02;
const MIN_K = 0.08;
const MAX_K = 12;

export class GraphRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private width = 0;
  private height = 0;

  /** World → screen: screen = world * k + (tx, ty). */
  private k = 1;
  /** The zoom `fit()` chose, used as the baseline for the label thresholds. */
  private fitK = 1;
  private tx = 0;
  private ty = 0;

  private adjacency: Adjacency;
  private hovered: GraphNode | null = null;
  private selected: GraphNode | null = null;
  /**
   * Whether the index note has been opened. The "Start here" wording is an
   * invitation, and an invitation that has been taken has done its job — from
   * then on the node names itself, so the label matches the note the reader
   * just read.
   *
   * Opening some *other* note does not bring the invitation back: that would
   * make the biggest label on the canvas flicker between two words as they
   * browse. Only clearing the selection outright does — closing the reading
   * panel puts the page back to the view it was landed on, and on that view
   * the invitation is the whole point of the node.
   */
  private indexOpened = false;
  /**
   * Chrome covering the canvas — the reading panel on the right, the phone's
   * sheet at the bottom, and the shell's top bar. Labels are kept inside what
   * this leaves, so none is drawn off the edge or behind the chrome.
   *
   * `top` exists because the bar over the graph is now the site's own frosted
   * header rather than the gradient scrim it replaced. A scrim only dimmed what
   * passed under it, so the camera could ignore it; an opaque bar hides it, and
   * a course whose name is behind the bar is a course the survey view doesn't
   * name at all.
   */
  private viewInset: Inset = { top: 0, right: 0, bottom: 0 };

  /** Topic ids currently shown. null means "no filter applied". */
  private topicFilter: Set<string> | null = null;
  /** Whether the course ring is drawn. The index is never filtered out. */
  private showCourses = true;
  /** Node ids matching the live search, or null when the box is empty. */
  private searchMatches: Set<number> | null = null;
  private labelMode: LabelMode = 'auto';
  /** Nodes by descending degree, so label passes can go hubs-first without
      re-sorting 836 entries on every frame. */
  private byDegree: GraphNode[];
  /** Neighbours of the selected node, including itself. */
  private highlight = new Set<number>();

  private raf = 0;
  private frameQueued = false;
  private disposed = false;

  /** The cached scene — see `scene()`. Held as a bitmap so a hover is a blit. */
  private sceneCanvas: HTMLCanvasElement | null = null;
  private sceneCtx: CanvasRenderingContext2D | null = null;
  private sceneKey = '';
  /* Bumped by the three things that change the scene without changing the
     camera. The selection is keyed on directly, by node id. */
  private filterVersion = 0;
  private paletteVersion = 0;
  private searchVersion = 0;

  // Pointer state
  private pointers = new Map<number, { x: number; y: number }>();
  private panning = false;
  private moved = 0;
  private lastPinch = 0;

  // Declared explicitly rather than as constructor parameter properties:
  // tsconfig sets `erasableSyntaxOnly`, which rules those out.
  private canvas: HTMLCanvasElement;
  private data: GraphData;
  private palette: GraphPalette;
  private cb: RendererCallbacks;

  constructor(
    canvas: HTMLCanvasElement,
    data: GraphData,
    palette: GraphPalette,
    cb: RendererCallbacks,
  ) {
    this.canvas = canvas;
    this.data = data;
    this.palette = palette;
    this.cb = cb;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;

    this.adjacency = buildAdjacency(data.nodes.length, data.edges);
    this.byDegree = [...data.nodes].sort((a, b) => b.degree - a.degree);

    this.attach();
    this.resize();
    this.fit();
  }

  // ---------------------------------------------------------------- lifecycle

  private attach() {
    const c = this.canvas;
    c.addEventListener('pointerdown', this.onPointerDown);
    c.addEventListener('pointermove', this.onPointerMove);
    c.addEventListener('pointerup', this.onPointerUp);
    c.addEventListener('pointercancel', this.onPointerUp);
    c.addEventListener('pointerleave', this.onPointerLeave);
    c.addEventListener('wheel', this.onWheel, { passive: false });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onPointerDown);
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerUp);
    c.removeEventListener('pointerleave', this.onPointerLeave);
    c.removeEventListener('wheel', this.onWheel);
    // A viewport-sized bitmap at dpr 2 is tens of megabytes; don't leave it
    // pinned by the renderer after the page is gone.
    this.sceneCanvas = null;
    this.sceneCtx = null;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.invalidate();
  }

  setPalette(palette: GraphPalette) {
    this.palette = palette;
    this.paletteVersion++;
    // Painted synchronously rather than queued: a theme swap runs inside
    // startViewTransition, which snapshots the canvas as it is. One frame late
    // and the reveal cross-fades to the old colors.
    this.draw();
  }

  // ------------------------------------------------------------------ camera

  /** Frame the graph, ignoring the outermost 0.5% so orphans can't shrink it. */
  fit(padding = 60, inset: Partial<Inset> = {}) {
    const xs = this.data.nodes.map((n) => n.x).sort((a, b) => a - b);
    const ys = this.data.nodes.map((n) => n.y).sort((a, b) => a - b);
    const q = (arr: number[], p: number) => arr[Math.floor((arr.length - 1) * p)];
    const minX = q(xs, 0.005);
    const maxX = q(xs, 0.995);
    const minY = q(ys, 0.005);
    const maxY = q(ys, 0.995);

    // Frame into what the chrome leaves, not the whole canvas. On a phone the
    // reading sheet owns the bottom ~62%, so without this the graph is centred
    // behind it and only its top edge is ever visible.
    const top = inset.top ?? 0;
    const w = this.width - (inset.right ?? 0);
    const h = this.height - top - (inset.bottom ?? 0);

    this.k = Math.min(
      (w - padding * 2) / Math.max(maxX - minX, 1),
      (h - padding * 2) / Math.max(maxY - minY, 1),
    );
    this.fitK = this.k;
    this.tx = w / 2 - ((minX + maxX) / 2) * this.k;
    this.ty = top + h / 2 - ((minY + maxY) / 2) * this.k;
    this.invalidate();
  }

  /**
   * Centre on a node at a readable zoom.
   *
   * `inset` describes chrome covering the canvas — the reading panel, mostly —
   * so the node lands in the middle of what's actually visible rather than
   * behind the panel.
   */
  focus(node: GraphNode, k = 2.2, inset: Partial<Inset> = {}) {
    const right = inset.right ?? 0;
    const top = inset.top ?? 0;
    const bottom = inset.bottom ?? 0;
    this.k = k;
    this.tx = (this.width - right) / 2 - node.x * k;
    this.ty = top + (this.height - top - bottom) / 2 - node.y * k;
    this.invalidate();
  }

  /**
   * The survey view: the index centred with every course, and every course
   * label, around it.
   *
   * This is both the landing view and where "Start here" goes, deliberately the
   * same camera. Opening the index used to zoom and pan from wherever you were,
   * which read as a lurch on the one click most people make first; now it only
   * turns the labels on. `inset` is passed in both cases even though nothing
   * covers the canvas on a cold load, because reserving the panel's space up
   * front is what makes the two views identical.
   *
   * The whole frame is nudged down by a little of its own height. The graph's
   * mass sits above the index — the note clusters hang upward off the spiral —
   * so centring on the index alone leaves the top labels tight against the edge
   * and a band of empty canvas underneath. Dropping the frame evens that out,
   * at the cost of clipping the lowest notes, which are the least interesting
   * thing on screen.
   */
  surveyFrame(inset: Partial<Inset> = {}) {
    // A phone gets `coverFrame` on the index instead — see there. Landing and
    // "Start here" still share it, so the camera is just as still there as on
    // the desktop.
    if (this.narrow) {
      this.coverFrame(this.data.nodes[this.data.indexId], inset);
      return;
    }

    const k = this.courseFitZoom(inset);
    const idx = this.data.nodes[this.data.indexId];
    const top = inset.top ?? 0;
    const visH = this.height - top - (inset.bottom ?? 0);
    this.k = k;
    this.fitK = k;
    this.tx = (this.width - (inset.right ?? 0)) / 2 - idx.x * k;
    this.ty = top + visH / 2 - idx.y * k + visH * SURVEY_DROP;
    this.invalidate();
  }

  /**
   * The phone's framing: `node` centred in the visible band, with the course
   * ring *covering* that band rather than fitting inside it.
   *
   * The band on a phone is a wide strip — 344x147 with the sheet at rest — and
   * containing the ring in it means the short side decides, so the whole degree
   * was drawn at k=0.046 in a 147px slot. That is below `MIN_K`, which is the
   * renderer's own opinion of the smallest zoom worth drawing; the result was a
   * blob rather than an overview. Covering uses the *long* side instead, which
   * on that strip is 3.2x closer and clips the ring top and bottom — you are
   * looking at the middle of something bigger, which is honest and legible
   * where the blob was neither.
   *
   * It is also what makes the sheet a zoom control. The band grows as the sheet
   * is pulled down, and once it is taller than it is wide the height takes over
   * as the long side, so the view keeps closing in on `node` all the way to the
   * collapsed sheet — roughly 2x from rest to floor. Making room and getting
   * closer are the same gesture, which is the only reading of "drag down to see
   * more" that does anything for a reader who has already chosen a node.
   *
   * No `SURVEY_DROP` here: that evens out a frame with empty canvas below it,
   * and a strip this short has no room to give away.
   */
  coverFrame(node: GraphNode, inset: Partial<Inset> = {}) {
    const k = this.courseCoverZoom(inset);
    const top = inset.top ?? 0;
    const visH = this.height - top - (inset.bottom ?? 0);
    this.k = k;
    this.fitK = k;
    this.tx = (this.width - (inset.right ?? 0)) / 2 - node.x * k;
    this.ty = top + visH / 2 - node.y * k;
    this.invalidate();
  }

  /**
   * Tell the renderer what the chrome covers, so labels stay clear of it.
   *
   * Set to the same inset the camera is framed with, panel open or not: a label
   * that re-flows the moment the panel appears is worse than one that always
   * sat where the panel will be.
   */
  setViewInset(inset: Partial<Inset>) {
    this.viewInset = {
      top: inset.top ?? 0,
      right: inset.right ?? 0,
      bottom: inset.bottom ?? 0,
    };
    this.invalidate();
  }

  /** Whether the page is laid out as a phone. See `NARROW`. */
  private get narrow() {
    return window.innerWidth <= NARROW;
  }

  /** The zoom `fit()` chose — a viewport-independent baseline for camera moves. */
  get fittedZoom() {
    return this.fitK;
  }

  /**
   * The zoom at which every course fits in the visible region, centred on the
   * index.
   *
   * "Start here" is a survey rather than a destination — opening it should show
   * the whole degree at once. Measuring the courses' actual extent is what makes
   * that true whatever the layout does; a fixed multiple of the fitted zoom
   * cropped the spiral's outer arm as soon as the ring grew.
   *
   * The extent is measured symmetrically around the index because `focus()`
   * centres on it, and `inset` is the chrome (the reading panel) covering the
   * canvas, so the fit is against what the reader can actually see.
   *
   * `padding` has to clear the *labels*, not just the course discs. Every course
   * is named in this view, and a name is wider than the disc it belongs to.
   *
   * 46, down from the 110 the outward labels needed and then from 60: labels
   * hang straight down, so the band around the ring only has to hold half a
   * name either side rather than a whole one stepped out along the ray. The
   * looser fit is still worth having — it spreads the courses further apart on
   * screen, which is what gives their labels room to sit tight under them — but
   * with the header taking a slice off the top of the band, 60 left the whole
   * arrangement reading smaller than the space it had.
   */
  courseFitZoom(inset: Partial<Inset> = {}, padding = 46) {
    return this.courseZoom(inset, padding, Math.min);
  }

  /** `courseFitZoom`'s twin, taking the larger of the two axes so the ring
      covers the visible band instead of fitting inside it. See `coverFrame`. */
  private courseCoverZoom(inset: Partial<Inset> = {}, padding = 24) {
    return this.courseZoom(inset, padding, Math.max);
  }

  /** The course ring's extent against the visible band, resolved on whichever
      axis `pick` chooses. */
  private courseZoom(
    inset: Partial<Inset>,
    padding: number,
    pick: (a: number, b: number) => number,
  ) {
    const idx = this.data.nodes[this.data.indexId];
    let dx = 0;
    let dy = 0;
    for (const n of this.data.nodes) {
      if (n.kind !== 'course') continue;
      dx = Math.max(dx, Math.abs(n.x - idx.x) + this.radius(n));
      dy = Math.max(dy, Math.abs(n.y - idx.y) + this.radius(n));
    }
    if (dx === 0 || dy === 0) return this.fitK;
    const w = Math.max(this.width - (inset.right ?? 0) - padding * 2, 1);
    const h = Math.max(this.height - (inset.top ?? 0) - (inset.bottom ?? 0) - padding * 2, 1);
    return Math.max(MIN_K, Math.min(MAX_K, pick(w / (dx * 2), h / (dy * 2))));
  }

  private toWorld(sx: number, sy: number) {
    return { x: (sx - this.tx) / this.k, y: (sy - this.ty) / this.k };
  }

  private zoomAt(sx: number, sy: number, factor: number) {
    const next = Math.max(MIN_K, Math.min(MAX_K, this.k * factor));
    if (next === this.k) return;
    // Keep the point under the cursor fixed.
    this.tx = sx - ((sx - this.tx) / this.k) * next;
    this.ty = sy - ((sy - this.ty) / this.k) * next;
    this.k = next;
    this.invalidate();
  }

  // ----------------------------------------------------------------- pointer

  private local(e: PointerEvent | WheelEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onPointerDown = (e: PointerEvent) => {
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    this.moved = 0;

    // Any press pans, including one that lands on a node. Nodes used to be
    // draggable, which on a touch screen meant a swipe that happened to start
    // on a node moved that node instead of the view — the graph is dense enough
    // that most of it is nodes, so panning was close to unusable on a phone.
    // A press that barely travels is still a click, resolved on pointerup.
    this.panning = true;
  };

  private onPointerMove = (e: PointerEvent) => {
    const p = this.local(e);
    const prev = this.pointers.get(e.pointerId);

    if (this.pointers.size === 2 && prev) {
      // Pinch: scale by the change in distance between the two pointers.
      this.pointers.set(e.pointerId, p);
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.lastPinch > 0) {
        this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / this.lastPinch);
      }
      this.lastPinch = dist;
      // A pinch counts as travel. Without this, lifting the first finger after
      // zooming looks like a stationary tap and opens whatever note happens to
      // be under it.
      this.moved += 10;
      return;
    }

    if (this.panning && prev) {
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.tx += dx;
      this.ty += dy;
      this.pointers.set(e.pointerId, p);
      this.invalidate();
      return;
    }

    this.setHover(this.pick(p.x, p.y));
  };

  private onPointerUp = (e: PointerEvent) => {
    const p = this.local(e);

    // A press that barely travelled is a click, not a pan.
    if (this.panning && this.moved < 5) {
      const hit = this.pick(p.x, p.y);
      if (hit) this.cb.onSelect(hit);
    }

    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.lastPinch = 0;
    if (this.pointers.size === 0) this.panning = false;
  };

  private onPointerLeave = () => {
    this.setHover(null);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = this.local(e);
    this.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
  };

  /**
   * What's under the cursor.
   *
   * Ranked by distance to each node's *edge*, not its centre. Ranking by centre
   * — which is all a quadtree nearest-neighbour query can do — means clicking
   * the middle of a large node hands you a tiny one sitting near its rim, purely
   * because that speck's centre happens to be closer to the cursor than the big
   * node's centre is. On the index, radius 34, that turned "Start here" into a
   * coin flip. Edge distance goes negative inside a disc, so the node you are
   * actually within always wins, and the deepest one wins ties.
   *
   * A linear scan over ~835 nodes is well under a tenth of a millisecond, and
   * it replaced a quadtree that had to be rebuilt on every simulation tick —
   * so this is cheaper overall as well as correct.
   */
  private pick(sx: number, sy: number): GraphNode | null {
    const { x, y } = this.toWorld(sx, sy);
    // Forgiveness for near-misses, in world units, so small nodes stay
    // reachable when zoomed out without swallowing their neighbours.
    const slack = 12 / this.k;

    let best: GraphNode | null = null;
    let bestEdge = Infinity;
    for (const n of this.data.nodes) {
      if (!this.shown(n)) continue;
      const edge = Math.hypot(n.x - x, n.y - y) - this.radius(n);
      if (edge < bestEdge) {
        bestEdge = edge;
        best = n;
      }
    }
    return bestEdge <= slack ? best : null;
  }

  /**
   * Hover names the node under the cursor and nothing more.
   *
   * It used to drive the highlight too, which made the graph flare and dim
   * under every stray mouse movement on the way to a click. Highlighting is now
   * strictly a consequence of selecting.
   */
  private setHover(node: GraphNode | null) {
    if (node === this.hovered) return;
    this.hovered = node;
    this.canvas.style.cursor = node ? 'pointer' : 'grab';
    this.cb.onHover(node);
    this.invalidate();
  }

  /**
   * Restrict what's drawn: topic buckets, and the course ring as its own toggle.
   *
   * The index is never filtered out — it's the entry point, and losing it would
   * leave nothing to navigate back to. Hidden nodes are skipped by `pick()` as
   * well, so they can't be clicked through the gap where they used to be.
   */
  setFilter(topics: Set<string> | null, showCourses: boolean) {
    this.topicFilter = topics;
    this.showCourses = showCourses;
    this.filterVersion++;
    this.invalidate();
  }

  /**
   * Is this node currently drawn?
   *
   * Nodes carry several topics, and one enabled topic is enough to keep them —
   * a note tagged both `calculus` and `machine-learning` belongs in either
   * filter, and dropping it from one because its *primary* topic was the other
   * is just wrong. Courses obey the topic filter too, so narrowing to one
   * subject still shows the courses that subject is taught in.
   */
  private shown(n: GraphNode) {
    if (n.kind === 'index') return true;
    if (n.kind === 'course' && !this.showCourses) return false;
    if (!this.topicFilter) return true;
    return n.topics.some((t) => this.topicFilter!.has(t));
  }

  /**
   * Light the nodes matching the live search and dim the rest, so you can see
   * *where* your matches sit in the graph before committing to one of them.
   * Takes precedence over the selection highlight while a query is active.
   */
  setSearchMatches(ids: Set<number> | null) {
    this.searchMatches = ids && ids.size ? ids : null;
    this.searchVersion++;
    this.invalidate();
  }

  setLabelMode(mode: LabelMode) {
    if (mode === this.labelMode) return;
    this.labelMode = mode;
    this.invalidate();
  }

  /** Mark the selected node. This is the only thing that lights a neighbourhood. */
  setSelected(node: GraphNode | null) {
    if (node === this.selected) return;
    this.selected = node;
    // Set here rather than in the click handler so a cold load of the index's
    // own URL counts too — that reader has the note open just the same. And
    // cleared when the selection goes: nothing is selected only on the landing
    // view and after a reset, which are the same view, and the one the
    // invitation belongs to.
    if (node?.kind === 'index') this.indexOpened = true;
    else if (!node) this.indexOpened = false;
    this.recomputeHighlight();
  }

  private recomputeHighlight() {
    const focus = this.selected;
    this.highlight.clear();
    if (focus) {
      this.highlight.add(focus.id);
      const { offsets, neighbours } = this.adjacency;
      for (let i = offsets[focus.id]; i < offsets[focus.id + 1]; i++) {
        this.highlight.add(neighbours[i]);
      }
    }
    this.invalidate();
  }

  // ------------------------------------------------------------------ render

  // The index and course nodes are the things you are meant to aim at, so they
  // are sized to stay comfortably clickable even at the default fitted zoom
  // (k ~= 0.45), where a radius of 9 lands under 5 physical pixels.
  private radius(n: GraphNode) {
    if (n.kind === 'index') return 34;
    if (n.kind === 'course') return 16 + Math.sqrt(n.degree) * 0.8;
    // Steeper than sqrt: at sqrt, a 1-link note and a 40-link hub differ by
    // about five pixels and everything reads as equally important. This pushes
    // hubs forward and lets leaves recede, which is most of what gives the eye
    // something to navigate by in a crowd. Kept below the course sizes so the
    // spine still reads as a tier above.
    return 1.8 + Math.pow(n.degree, 0.58) * 1.2;
  }

  private colorOf(n: GraphNode) {
    if (n.kind === 'index') return this.palette.nodeIndex;
    if (n.kind === 'course') return this.palette.nodeCourse;
    return (n.topic && this.palette.topic[n.topic]) || this.palette.nodeDim;
  }

  /**
   * Schedule a repaint.
   *
   * Nothing is drawn on a timer. A permanently-running rAF loop that mostly
   * checks a boolean still wakes the compositor sixty times a second for no
   * reason; this way a settled graph costs literally nothing until something
   * changes — a hover, a pan, or a simulation tick.
   */
  private invalidate() {
    if (this.frameQueued || this.disposed) return;
    this.frameQueued = true;
    this.raf = requestAnimationFrame(() => {
      this.frameQueued = false;
      if (!this.disposed) this.draw();
    });
  }

  /** The world rect currently on screen, with a margin so a node straddling
      the edge still draws. */
  private viewRect() {
    return {
      x0: -this.tx / this.k - 40,
      y0: -this.ty / this.k - 40,
      x1: (this.width - this.tx) / this.k + 40,
      y1: (this.height - this.ty) / this.k + 40,
    };
  }

  private isVisible(n: GraphNode, view: ReturnType<GraphRenderer['viewRect']>) {
    return (
      this.shown(n) && n.x >= view.x0 && n.x <= view.x1 && n.y >= view.y0 && n.y <= view.y1
    );
  }

  /** The ring that marks a node out — open, matched, or under the cursor. */
  private ring(ctx: CanvasRenderingContext2D, n: GraphNode, width: number) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, this.radius(n) + 6 / this.k, 0, Math.PI * 2);
    ctx.strokeStyle = this.palette.linkHighlight;
    ctx.lineWidth = width / this.k;
    ctx.stroke();
  }

  /**
   * Everything that doesn't move with the cursor, as a bitmap.
   *
   * 13.7k links and ~950 discs cost about 10ms a frame between them, and every
   * pixel of it is identical from one frame to the next unless the camera, the
   * filter, the palette or the selection changed. Hover changes none of those —
   * it adds one ring — so re-drawing the lot on every mouse move was paying the
   * whole frame to move a circle. Cached here and blitted, a hover costs a
   * `drawImage`, the ring, and the labels.
   *
   * Rebuilt at device resolution under the same transform the visible canvas
   * uses, so the blit is a 1:1 copy with no resampling, and it carries its own
   * background so it lands opaque.
   */
  private scene() {
    const pw = Math.max(1, Math.round(this.width * this.dpr));
    const ph = Math.max(1, Math.round(this.height * this.dpr));
    const key = [
      pw,
      ph,
      this.k,
      this.tx,
      this.ty,
      this.filterVersion,
      this.paletteVersion,
      this.searchVersion,
      this.selected?.id ?? -1,
    ].join('|');

    let c = this.sceneCanvas;
    let m = this.sceneCtx;
    if (!c || !m) {
      c = document.createElement('canvas');
      m = c.getContext('2d');
      if (!m) throw new Error('2D canvas context unavailable');
      this.sceneCanvas = c;
      this.sceneCtx = m;
    } else if (this.sceneKey === key) {
      return c;
    }

    // Sizing a canvas clears it; the transform only needs resetting on the
    // path where it isn't resized.
    if (c.width !== pw || c.height !== ph) {
      c.width = pw;
      c.height = ph;
    } else {
      m.setTransform(1, 0, 0, 1, 0, 0);
    }

    const palette = this.palette;
    // Only selection dims the graph. Hover is a readout, not a state change.
    const focus = this.selected;
    const hasFocus = focus !== null;
    // While a search is live it owns the dimming; otherwise the selection does.
    const lit = this.searchMatches ?? (hasFocus ? this.highlight : null);
    const dimming = lit !== null;

    m.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    m.fillStyle = palette.bg;
    m.fillRect(0, 0, this.width, this.height);
    m.transform(this.k, 0, 0, this.k, this.tx, this.ty);

    const { edges, nodes } = this.data;
    const view = this.viewRect();
    const onScreen = (n: GraphNode) =>
      n.x >= view.x0 && n.x <= view.x1 && n.y >= view.y0 && n.y <= view.y1;
    const visible = (n: GraphNode) => this.isVisible(n, view);

    // --- links: one path, one stroke -------------------------------------
    // Every link shares a style, so the whole mesh is a single draw call. This
    // is why "thin and transparent unless highlighted" is cheap rather than
    // expensive: only the highlighted subset needs a second pass.
    m.lineWidth = Math.min(1.2 / this.k, 1.4);
    m.strokeStyle = palette.link;
    // Zoomed out, 6.4k links overlap into a fog that swallows the nodes sitting
    // in it. Fading the mesh as k shrinks lets the nodes come forward; zoomed
    // in, where links are individually legible and useful, they return to full.
    const linkFog = Math.max(0.35, Math.min(1, this.k / 1.2));
    m.globalAlpha = (dimming ? 0.45 : 1) * linkFog;
    m.beginPath();
    for (let i = 0; i < edges.length; i += 2) {
      const a = nodes[edges[i]];
      const b = nodes[edges[i + 1]];
      // A link needs both ends present, or it dangles into empty space.
      if (!this.shown(a) || !this.shown(b)) continue;
      if (!onScreen(a) && !onScreen(b)) continue;
      m.moveTo(a.x, a.y);
      m.lineTo(b.x, b.y);
    }
    m.stroke();
    m.globalAlpha = 1;

    // --- highlighted links ------------------------------------------------
    // Suppressed while searching: the search is about where matches are, not
    // about one node's neighbourhood.
    if (hasFocus && !this.searchMatches) {
      m.beginPath();
      const id = focus.id;
      const { offsets, neighbours } = this.adjacency;
      for (let i = offsets[id]; i < offsets[id + 1]; i++) {
        const b = nodes[neighbours[i]];
        if (!this.shown(b)) continue;
        m.moveTo(focus.x, focus.y);
        m.lineTo(b.x, b.y);
      }
      m.strokeStyle = palette.linkHighlight;
      m.lineWidth = Math.min(2 / this.k, 2.4);
      m.stroke();
    }

    // --- nodes ------------------------------------------------------------
    const strokeW = Math.min(1.4 / this.k, 1.6);
    const drawNode = (n: GraphNode) => {
      const dim = dimming && !lit.has(n.id);
      m.globalAlpha = dim ? 0.32 : 1;
      m.beginPath();
      m.arc(n.x, n.y, this.radius(n), 0, Math.PI * 2);
      m.fillStyle = this.colorOf(n);
      m.fill();
      // Ring in the background color so adjacent nodes stay countable.
      m.lineWidth = strokeW;
      m.strokeStyle = palette.bg;
      m.stroke();
    };

    for (const n of nodes) if (n.kind === 'note' && visible(n)) drawNode(n);
    for (const n of nodes) if (n.kind === 'course' && visible(n)) drawNode(n);
    const idx = nodes[this.data.indexId];
    if (visible(idx)) drawNode(idx);
    m.globalAlpha = 1;

    // Ring the open note, so the panel and the graph agree on what you're
    // looking at.
    if (this.selected) this.ring(m, this.selected, 2);

    if (this.searchMatches) {
      for (const id of this.searchMatches) {
        const n = nodes[id];
        if (visible(n)) this.ring(m, n, 1.5);
      }
    }

    this.sceneKey = key;
    return c;
  }

  draw() {
    const { ctx, palette } = this;
    const nodes = this.data.nodes;
    const idx = nodes[this.data.indexId];
    const focus = this.selected;
    const hasFocus = focus !== null;

    const view = this.viewRect();
    const visible = (n: GraphNode) => this.isVisible(n, view);

    // Links, discs and the rings that mark the open note and the search hits
    // all come off the cached bitmap in one copy — see `scene()`. Only the
    // hover ring and the labels are drawn per frame.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.scene(), 0, 0);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.transform(this.k, 0, 0, this.k, this.tx, this.ty);

    // Ring whatever is under the cursor too. The pick radius is deliberately
    // forgiving, so in a dense cluster the node you get is often not the one
    // you think you're pointing at — this shows which one you'd actually open.
    if (this.hovered && this.hovered !== this.selected && visible(this.hovered)) {
      ctx.globalAlpha = 0.75;
      this.ring(ctx, this.hovered, 1.5);
      ctx.globalAlpha = 1;
    }

    // --- labels -----------------------------------------------------------
    // Drawn in screen space, not world space: text stays crisp at any zoom, and
    // collisions can be measured in the units that actually matter.
    //
    // Strictly greedy in priority order — what you're pointing at, what you've
    // selected, the entry point, the courses, then everything else — and a
    // label that would touch one already placed is simply not drawn. Only the
    // first three are allowed to force their way in. Everything else competes
    // for the remaining space, so the screen never carries more text than it
    // can show legibly; zooming in frees space and the rest reappear on their
    // own.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.globalAlpha = 1;

    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    /* One name per node. The passes below overlap on purpose — the selected
       node is labelled by its own pass and is usually a course or a lit
       neighbour as well — and without this the second pass, finding its own
       first slot taken, would drop the same name a rung lower and draw it
       twice. */
    const named = new Set<number>();
    /** Breathing room between neighbouring labels, in screen pixels. */
    const GAP = 5;
    /** The part of the canvas the reader can actually see, and its margin. */
    const visW = this.width - this.viewInset.right;
    const visH = this.height - this.viewInset.bottom;
    /* The top bar's lower edge. Unlike `visW`/`visH` this is a floor rather
       than a ceiling, so it is carried separately instead of folded into a
       height. */
    const visT = this.viewInset.top;
    const EDGE = 6;

    /* Every label hangs straight down from the node it names — same x, further
       down when it has to be. Labels used to step outward along the ray from
       the index instead, which seated all thirty-two but put most of them on
       top of another disc: at the survey zoom 23 of 32 covered a course. A name
       sitting on a node that isn't its own is worse than a name a little way
       off, and the varying bearings read as arbitrary.

       So: one direction, and the ladder only decides how far. Rungs are screen
       pixels below the node's edge, smallest first, so a label drops only as
       far as it must to clear the labels already placed and the hub discs. A
       leader line keeps a label that had to drop attached to its node.

       Course names are long and the ring is small at the survey zoom, so a
       handful still find no clear air, and those go unlabelled rather than
       taking a slot that clips something — a label that has to be untangled
       from its neighbour is worse than a disc you zoom in on. Against the
       shipped layout that leaves 3 of 32 unnamed at 1440x900 and 2 at
       1920x1080, all of them named again a little way into the zoom, and all 32
       listed in the panel throughout. */
    const LADDER = [4, 22, 40];
    /* Sideways, only once every rung at that depth is taken. Searched
       drop-major and centred-first, so a label leaves the middle of its node
       only after the depths above have failed, and moves the smaller distance
       when it does. The cap is what keeps a label readable as belonging to the
       node above it: 60px is about half a name, so the disc still sits over the
       text that names it. */
    /* The last two are a long way sideways, and the cost ranking is what makes
       them safe to offer: at 1.5x weight they score below every other slot, so
       a label reaches that far only when the alternative is not being drawn. */
    const NUDGES = [0, -30, 30, -60, 60, -95, 95];
    /* Above the node, tried as part of one ranked search rather than as a second
       pass. Every slot is scored by how far it moves the label and the cheapest
       feasible one wins, so a label goes up only to sit *closer* than it could
       below — 4px above beats 40px below, and beats sliding 60px sideways to
       stay below, which was the ordering bug that had names veering off to one
       side while clear air sat directly over the node.

       Sideways counts for more than down, because an offset label has to be
       traced back along its leader while a lower one is still in its node's
       column. Above carries a small constant so below wins a tie. */
    const SIDES = ['below', 'above'] as const;
    const LATERAL_COST = 1.5;
    const ABOVE_COST = 6;
    /* Notes stay centred, below, and give way instead — there can be thirty of
       them lit at once, and thirty scattered labels is a thicket. */
    const NOTE_LADDER = [4, 20, 36];
    const NOTE_NUDGES = [0];
    /** What a label must not cover: the discs big enough to be aimed at. */
    const hubs = this.data.nodes
      .filter((n) => (n.kind === 'course' || n.kind === 'index') && visible(n))
      .map((n) => ({
        id: n.id,
        cx: n.x * this.k + this.tx,
        cy: n.y * this.k + this.ty,
        r: this.radius(n) * this.k,
      }));

    const label = (n: GraphNode, size: number, force = false, bold = false) => {
      if (named.has(n.id)) return;
      // The index is the way in, so it says so rather than naming itself. Its
      // real title still shows in the readout and on the note it opens. Size is
      // fixed here rather than by the caller, so it doesn't shrink the moment
      // you hover it and get labelled by a different branch.
      const isIndex = n.kind === 'index';
      // "Start here" is an invitation to explore, which is the desktop's job.
      // A phone navigates through the pages, so there the node is just labelled
      // for what it is — and at a size that doesn't span the screen. Once the
      // invitation has been taken it reads as "Index" everywhere.
      const phone = this.narrow;
      const text = isIndex ? (phone || this.indexOpened ? 'Index' : 'Start here') : n.title;
      if (isIndex) {
        size = phone ? 15 : 21;
        bold = true;
      }

      const nx = n.x * this.k + this.tx;
      const ny = n.y * this.k + this.ty;
      const edge = this.radius(n) * this.k;

      ctx.font = `${bold ? '600 ' : ''}${size}px ui-sans-serif, system-ui, sans-serif`;
      const w = ctx.measureText(text).width;
      const padX = 7;
      const padY = 4;

      // Courses may drop a long way to find clear air; notes give way instead.
      const roomy = n.kind === 'course';

      const hits = (b: { x0: number; y0: number; x1: number; y1: number }) =>
        placed.some(
          (p) => b.x0 - GAP < p.x1 && b.x1 + GAP > p.x0 && b.y0 - GAP < p.y1 && b.y1 + GAP > p.y0,
        );

      /** Whether `b` would sit over a hub other than the one it names. Nearest
          point on the box to the centre, against the radius — the discs are
          circles and testing their bounding boxes rejected clear slots. */
      const coversHub = (b: { x0: number; y0: number; x1: number; y1: number }) =>
        hubs.some((h) => {
          if (h.id === n.id) return false;
          const px = Math.max(b.x0, Math.min(h.cx, b.x1));
          const py = Math.max(b.y0, Math.min(h.cy, b.y1));
          return Math.hypot(h.cx - px, h.cy - py) < h.r;
        });

      type Box = { x0: number; y0: number; x1: number; y1: number };
      let box: Box | null = null;
      let sx = 0;
      let sy = 0;
      let stepped = false;
      let above = false;

      const rungs = roomy ? LADDER : NOTE_LADDER;
      const nudges = roomy ? NUDGES : NOTE_NUDGES;
      const sides = roomy ? SIDES : ([SIDES[0]] as const);
      const slots = [];
      for (const [step, drop] of rungs.entries()) {
        for (const side of sides) {
          for (const nudge of nudges) {
            slots.push({
              step,
              drop,
              side,
              nudge,
              cost:
                drop + Math.abs(nudge) * LATERAL_COST + (side === 'above' ? ABOVE_COST : 0),
            });
          }
        }
      }
      slots.sort((a, b) => a.cost - b.cost);

      for (const { step, drop, side, nudge } of slots) {
        let cx = nx + nudge;
        // `cy` is the text's top edge, so an upward slot has to clear its own
        // height and padding as well as the gap.
        let cy = side === 'below' ? ny + edge + drop : ny - edge - drop - size - padY * 2;

        // Slide the label back inside the visible region rather than letting it
        // hang off the edge or slip behind the panel. Long names on the outer
        // courses overflow otherwise — "Introduction to Computer Science" ran
        // 62px past the left edge at 1440x900. Sliding beats dropping: the
        // leader line still ties it to its node, so a label that had to move is
        // merely offset, not lost.
        const halfW = w / 2 + padX;
        if (halfW * 2 > visW - EDGE * 2 || size + padY * 2 > visH - visT - EDGE * 2) continue;
        cx = Math.min(Math.max(cx, EDGE + halfW), visW - EDGE - halfW);
        cy = Math.min(Math.max(cy, visT + EDGE + padY), visH - EDGE - size - padY);

        const b: Box = { x0: cx - halfW, y0: cy - padY, x1: cx + halfW, y1: cy + size + padY };
        if (force || (!hits(b) && !coversHub(b))) {
          box = b;
          sx = cx;
          sy = cy;
          // A leader is what makes a moved label readable. Worth drawing for a
          // sideways nudge even on the first rung, where the label is still
          // tight against the node but no longer under its middle — and always
          // for one that went above, which is against the rule the rest of the
          // canvas has taught the eye.
          stepped = step > 0 || side === 'above' || Math.abs(cx - nx) > 1;
          above = side === 'above';
          break;
        }
      }
      // Nothing clear: give way. The name is back as soon as the zoom opens
      // room, and the panel lists every course meanwhile.
      if (!box) return;
      placed.push(box);
      named.add(n.id);

      // A label that had to step outward is no longer touching its node, so it
      // gets a hairline back to it. Drawn under the plate, so the plate covers
      // the end of the line rather than the line crossing the text.
      if (stepped) {
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = palette.label;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(nx, ny + (above ? -edge : edge));
        ctx.lineTo(sx, above ? box.y1 : box.y0);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // A filled plate, not just an outline. Over a dense cluster a haloed
      // glyph still competes with whatever colour is behind each stroke; a
      // plate gives the text a surface of its own. Kept translucent so the
      // nodes underneath stay readable as shapes.
      const r = Math.min(6, (box.y1 - box.y0) / 2);
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = palette.bg;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0, r);
      } else {
        ctx.rect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
      }
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = palette.label;
      ctx.fillText(text, sx, sy);
    };

    // Nothing is labelled for hover. The ring already shows which node you'd
    // open, and the readout in the corner already names it — putting the name
    // on the canvas as well was the same text twice.

    if (this.labelMode === 'none') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return;
    }

    // On a phone, the selected node and nothing else.
    //
    // There is no room for more: a third of the width, and the reading sheet
    // over most of the height. Even the index's own label goes — navigation
    // there runs through the pages rather than the canvas, so the graph is an
    // overview to orient by, not a menu to aim at.
    if (this.narrow) {
      if (this.selected && visible(this.selected)) label(this.selected, 14, true);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return;
    }

    // 1. The entry point. At the starting view this is the only text on screen.
    if (visible(idx)) label(idx, 21, true, true);

    // 2. What's selected — the anchor for the lit neighbourhood around it.
    if (this.selected && this.selected !== idx && visible(this.selected)) {
      label(this.selected, 15, true);
    }

    // 3. Courses, biggest first — but not at the starting view, where thirty-odd
    //    course names over the densest part of the graph is exactly the clutter
    //    the "Start here" node exists to cut through. They arrive as you zoom,
    //    and immediately whenever they're part of what you've selected or
    //    searched — which includes opening "Start here" itself, since every
    //    course is a neighbour of the index.
    const zoomedForCourses = this.k > this.fitK * LABEL_ZOOM_COURSE;
    for (const n of this.byDegree) {
      if (n.kind !== 'course' || !visible(n)) continue;
      const requested =
        (this.searchMatches?.has(n.id) ?? false) || (hasFocus && this.highlight.has(n.id));
      if (zoomedForCourses || requested) label(n, 14);
    }

    // 4. Whatever context the current mode calls for, hubs first, and every one
    //    of them collision-checked — a lit neighbourhood of thirty notes used to
    //    force thirty labels onto the same few hundred pixels.
    if (this.labelMode === 'courses') {
      // Courses only — note names are exactly what this mode exists to drop.
    } else if (this.searchMatches) {
      for (const n of this.byDegree) {
        if (n.kind === 'note' && this.searchMatches.has(n.id) && visible(n)) label(n, 12);
      }
    } else if (hasFocus) {
      for (const n of this.byDegree) {
        if (n.kind === 'note' && this.highlight.has(n.id) && visible(n)) label(n, 12);
      }
    } else if (this.k > this.fitK * LABEL_ZOOM_NOTE) {
      for (const n of this.byDegree) {
        if (n.kind === 'note' && visible(n)) label(n, 12);
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
