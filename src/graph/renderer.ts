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
/** Below this canvas width the layout is treated as a phone. Matches the
    breakpoint GraphPage uses for the note sheet. */
const NARROW = 720;

/** How far the survey view sits below centre, as a share of viewport height.
    Bounded by the lowest course label, not by the nodes: at 0.065 the bottom
    row runs within ~20px of the edge on a 1280x800, which reads as clipped. */
const SURVEY_DROP = 0.055;
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
    // Painted synchronously rather than queued: a theme swap runs inside
    // startViewTransition, which snapshots the canvas as it is. One frame late
    // and the reveal cross-fades to the old colors.
    this.draw();
  }

  // ------------------------------------------------------------------ camera

  /** Frame the graph, ignoring the outermost 0.5% so orphans can't shrink it. */
  fit(padding = 60) {
    const xs = this.data.nodes.map((n) => n.x).sort((a, b) => a - b);
    const ys = this.data.nodes.map((n) => n.y).sort((a, b) => a - b);
    const q = (arr: number[], p: number) => arr[Math.floor((arr.length - 1) * p)];
    const minX = q(xs, 0.005);
    const maxX = q(xs, 0.995);
    const minY = q(ys, 0.005);
    const maxY = q(ys, 0.995);

    this.k = Math.min(
      (this.width - padding * 2) / Math.max(maxX - minX, 1),
      (this.height - padding * 2) / Math.max(maxY - minY, 1),
    );
    this.fitK = this.k;
    this.tx = this.width / 2 - ((minX + maxX) / 2) * this.k;
    this.ty = this.height / 2 - ((minY + maxY) / 2) * this.k;
    this.invalidate();
  }

  /**
   * Centre on a node at a readable zoom.
   *
   * `inset` describes chrome covering the canvas — the reading panel, mostly —
   * so the node lands in the middle of what's actually visible rather than
   * behind the panel.
   */
  focus(node: GraphNode, k = 2.2, inset: { right?: number; bottom?: number } = {}) {
    const right = inset.right ?? 0;
    const bottom = inset.bottom ?? 0;
    this.k = k;
    this.tx = (this.width - right) / 2 - node.x * k;
    this.ty = (this.height - bottom) / 2 - node.y * k;
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
  surveyFrame(inset: { right?: number; bottom?: number } = {}) {
    // On a phone the note sheet takes ~62% of the screen, so fitting the
    // courses into what's left would frame the whole degree into a 100px
    // strip — past MIN_K and unreadable. A narrow screen gets the plain fit
    // instead: the whole graph in the whole viewport, with the sheet sliding
    // over it. Landing and "Start here" still share it, so the camera is just
    // as still there as on the desktop.
    if (this.width < NARROW) {
      this.fit();
      return;
    }

    const k = this.courseFitZoom(inset);
    const idx = this.data.nodes[this.data.indexId];
    this.k = k;
    this.fitK = k;
    this.tx = (this.width - (inset.right ?? 0)) / 2 - idx.x * k;
    this.ty = (this.height - (inset.bottom ?? 0)) / 2 - idx.y * k + this.height * SURVEY_DROP;
    this.invalidate();
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
   * is named in this view and the outer ones carry their names further out
   * still, so a fit tight enough for the nodes pushes that band off the edge.
   */
  courseFitZoom(inset: { right?: number; bottom?: number } = {}, padding = 110) {
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
    const h = Math.max(this.height - (inset.bottom ?? 0) - padding * 2, 1);
    return Math.max(MIN_K, Math.min(MAX_K, Math.min(w / (dx * 2), h / (dy * 2))));
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

  draw() {
    const { ctx, palette } = this;
    // Only selection dims the graph. Hover is a readout, not a state change.
    const focus = this.selected;
    const hasFocus = focus !== null;
    // While a search is live it owns the dimming; otherwise the selection does.
    const lit = this.searchMatches ?? (hasFocus ? this.highlight : null);
    const dimming = lit !== null;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.transform(this.k, 0, 0, this.k, this.tx, this.ty);

    const edges = this.data.edges;
    const nodes = this.data.nodes;

    // Cull to the visible world rect, with a margin so nodes straddling the
    // edge still draw.
    const view = {
      x0: -this.tx / this.k - 40,
      y0: -this.ty / this.k - 40,
      x1: (this.width - this.tx) / this.k + 40,
      y1: (this.height - this.ty) / this.k + 40,
    };
    const onScreen = (n: GraphNode) =>
      n.x >= view.x0 && n.x <= view.x1 && n.y >= view.y0 && n.y <= view.y1;
    const visible = (n: GraphNode) => this.shown(n) && onScreen(n);

    // --- links: one path, one stroke -------------------------------------
    // Every link shares a style, so the whole mesh is a single draw call. This
    // is why "thin and transparent unless highlighted" is cheap rather than
    // expensive: only the highlighted subset needs a second pass.
    ctx.lineWidth = Math.min(1.2 / this.k, 1.4);
    ctx.strokeStyle = palette.link;
    // Zoomed out, 6.4k links overlap into a fog that swallows the nodes sitting
    // in it. Fading the mesh as k shrinks lets the nodes come forward; zoomed
    // in, where links are individually legible and useful, they return to full.
    const linkFog = Math.max(0.35, Math.min(1, this.k / 1.2));
    ctx.globalAlpha = (dimming ? 0.45 : 1) * linkFog;
    ctx.beginPath();
    for (let i = 0; i < edges.length; i += 2) {
      const a = nodes[edges[i]];
      const b = nodes[edges[i + 1]];
      // A link needs both ends present, or it dangles into empty space.
      if (!this.shown(a) || !this.shown(b)) continue;
      if (!onScreen(a) && !onScreen(b)) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // --- highlighted links ------------------------------------------------
    // Suppressed while searching: the search is about where matches are, not
    // about one node's neighbourhood.
    if (hasFocus && !this.searchMatches) {
      ctx.beginPath();
      const id = focus.id;
      const { offsets, neighbours } = this.adjacency;
      for (let i = offsets[id]; i < offsets[id + 1]; i++) {
        const b = nodes[neighbours[i]];
        if (!this.shown(b)) continue;
        ctx.moveTo(focus.x, focus.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.strokeStyle = palette.linkHighlight;
      ctx.lineWidth = Math.min(2 / this.k, 2.4);
      ctx.stroke();
    }

    // --- nodes ------------------------------------------------------------
    const strokeW = Math.min(1.4 / this.k, 1.6);
    const drawNode = (n: GraphNode) => {
      const dim = dimming && !lit.has(n.id);
      ctx.globalAlpha = dim ? 0.32 : 1;
      ctx.beginPath();
      ctx.arc(n.x, n.y, this.radius(n), 0, Math.PI * 2);
      ctx.fillStyle = this.colorOf(n);
      ctx.fill();
      // Ring in the background color so adjacent nodes stay countable.
      ctx.lineWidth = strokeW;
      ctx.strokeStyle = palette.bg;
      ctx.stroke();
    };

    for (const n of nodes) if (n.kind === 'note' && visible(n)) drawNode(n);
    for (const n of nodes) if (n.kind === 'course' && visible(n)) drawNode(n);
    const idx = nodes[this.data.indexId];
    if (visible(idx)) drawNode(idx);
    ctx.globalAlpha = 1;

    // Ring the open note, so the panel and the graph agree on what you're
    // looking at.
    const ring = (n: GraphNode, width: number) => {
      ctx.beginPath();
      ctx.arc(n.x, n.y, this.radius(n) + 6 / this.k, 0, Math.PI * 2);
      ctx.strokeStyle = palette.linkHighlight;
      ctx.lineWidth = width / this.k;
      ctx.stroke();
    };
    if (this.selected) ring(this.selected, 2);

    if (this.searchMatches) {
      for (const id of this.searchMatches) {
        const n = nodes[id];
        if (visible(n)) ring(n, 1.5);
      }
    }

    // Ring whatever is under the cursor too. The pick radius is deliberately
    // forgiving, so in a dense cluster the node you get is often not the one
    // you think you're pointing at — this shows which one you'd actually open.
    if (this.hovered && this.hovered !== this.selected && visible(this.hovered)) {
      ctx.globalAlpha = 0.75;
      ring(this.hovered, 1.5);
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
    /** Breathing room between neighbouring labels, in screen pixels. */
    const GAP = 5;

    /* Where a course label may go, searched in order: out along the ray from
       the index, and at each distance a little way around it.

       Course names are long and the courses sit on a spiral, so at a zoom that
       keeps every one of them on screen there is roughly 3000px of ring to hold
       4200px of text. Placing each label directly under its node dropped a
       third of them to collisions — a named graph with a dozen anonymous grey
       discs left in it. Stepping outward into the empty space beyond the
       spiral, and swinging a few degrees along the ring when straight out is
       taken, seats all thirty-two with none overlapping down to 1280x800. A
       leader line keeps a label that moved attached to the node it names.

       Distances are screen pixels beyond the node's own edge, swings are
       radians; both smallest-first, so a label only moves as far as it must. */
    const LADDER = [4, 20, 38, 58, 80, 104, 130, 158, 188, 220];
    const DEG = Math.PI / 180;
    const SWINGS = [0, 7 * DEG, -7 * DEG, 15 * DEG, -15 * DEG];

    const label = (n: GraphNode, size: number, force = false, bold = false) => {
      // The index is the way in, so it says so rather than naming itself. Its
      // real title still shows in the readout and on the note it opens. Size is
      // fixed here rather than by the caller, so it doesn't shrink the moment
      // you hover it and get labelled by a different branch.
      const isIndex = n.kind === 'index';
      const text = isIndex ? 'Start here' : n.title;
      if (isIndex) {
        size = 21;
        bold = true;
      }

      const nx = n.x * this.k + this.tx;
      const ny = n.y * this.k + this.ty;
      const edge = this.radius(n) * this.k;

      ctx.font = `${bold ? '600 ' : ''}${size}px ui-sans-serif, system-ui, sans-serif`;
      const w = ctx.measureText(text).width;
      const padX = 7;
      const padY = 4;

      // Courses get the outward ladder; everything else sits under its node.
      const idx = this.data.nodes[this.data.indexId];
      const dx = n.x - idx.x;
      const dy = n.y - idx.y;
      const d = Math.hypot(dx, dy);
      const radial = n.kind === 'course' && d > 1e-6;

      const hits = (b: { x0: number; y0: number; x1: number; y1: number }) =>
        placed.some(
          (p) => b.x0 - GAP < p.x1 && b.x1 + GAP > p.x0 && b.y0 - GAP < p.y1 && b.y1 + GAP > p.y0,
        );

      /** Total area `b` would overlap, used to pick the least-bad fallback. */
      const overlap = (b: { x0: number; y0: number; x1: number; y1: number }) =>
        placed.reduce((sum, p) => {
          const ox = Math.min(b.x1, p.x1) - Math.max(b.x0, p.x0);
          const oy = Math.min(b.y1, p.y1) - Math.max(b.y0, p.y0);
          return sum + (ox > 0 && oy > 0 ? ox * oy : 0);
        }, 0);

      type Box = { x0: number; y0: number; x1: number; y1: number };
      let box: Box | null = null;
      let sx = 0;
      let sy = 0;
      let stepped = false;
      let fallback: { b: Box; cx: number; cy: number; moved: boolean } | null = null;
      let fallbackArea = Infinity;

      const rungs = radial ? LADDER : [4];
      const swings = radial ? SWINGS : [0];
      outer: for (const [step, extra] of rungs.entries()) {
        for (const swing of swings) {
          // Rotating the outward ray lets a blocked label slide along the ring
          // rather than only further out, which is what closes the last few
          // collisions in the crowded inner winding.
          const cos = Math.cos(swing);
          const sin = Math.sin(swing);
          const ux = (dx * cos - dy * sin) / d;
          const uy = (dx * sin + dy * cos) / d;
          const cx = radial ? nx + ux * (edge + extra) : nx;
          const cy = radial ? ny + uy * (edge + extra) - size / 2 : ny + edge + 4;
          if (cx < -240 || cx > this.width + 240 || cy < -24 || cy > this.height + 24) continue;
          const b: Box = {
            x0: cx - w / 2 - padX,
            y0: cy - padY,
            x1: cx + w / 2 + padX,
            y1: cy + size + padY,
          };
          const moved = step > 0 || swing !== 0;
          if (force || !hits(b)) {
            box = b;
            sx = cx;
            sy = cy;
            stepped = moved;
            break outer;
          }
          // On a small enough viewport every slot can be taken. A course is
          // never left anonymous — a name clipping another still says what the
          // node is, a bare grey disc says nothing — so keep the cheapest slot
          // seen and fall back to it. Notes keep the old behaviour and give way.
          const a = overlap(b);
          if (radial && a < fallbackArea) {
            fallbackArea = a;
            fallback = { b, cx, cy, moved };
          }
        }
      }
      if (!box && fallback) {
        box = fallback.b;
        sx = fallback.cx;
        sy = fallback.cy;
        stepped = fallback.moved;
      }
      if (!box) return;
      placed.push(box);

      // A label that had to step outward is no longer touching its node, so it
      // gets a hairline back to it. Drawn under the plate, so the plate covers
      // the end of the line rather than the line crossing the text.
      if (stepped) {
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = palette.label;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(nx + (dx / d) * edge, ny + (dy / d) * edge);
        ctx.lineTo(sx, sy + size / 2);
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
    // Naming all thirty-two at once is a desktop affordance. A phone has
    // roughly a third of the width and the sheet over most of the height, so
    // the same pass there is a wall of overlapping text on top of the graph
    // it is meant to describe. Narrow screens keep the progressive behaviour:
    // a course is named when you search it, zoom to it, or open it — never
    // just because the index is selected.
    const narrow = this.width < NARROW;
    const zoomedForCourses = this.k > this.fitK * LABEL_ZOOM_COURSE;
    for (const n of this.byDegree) {
      if (n.kind !== 'course' || !visible(n)) continue;
      const requested =
        (this.searchMatches?.has(n.id) ?? false) ||
        (!narrow && hasFocus && this.highlight.has(n.id));
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
