/**
 * A camera pan, played by the compositor rather than by the renderer.
 *
 * The graph's own frames are cheap — a full re-stroke of the link mesh
 * measures 1.77ms, a cached one 0.03ms — so this is not about drawing cost. It
 * is about *when* the frames arrive. Opening a note fetches its JSON and, when
 * that lands, parses the markdown through remark, rehype, KaTeX and highlight
 * in one synchronous block. Nothing driven by requestAnimationFrame runs while
 * that happens, so a pan animated on the main thread stalls partway across and
 * then jumps — which is exactly what dragging the graph never does, because a
 * drag advances by the events it is handed and a busy thread simply pauses it
 * harmlessly.
 *
 * So the pan does not animate the camera at all. The renderer paints the whole
 * move into one bitmap up front and hands it here; this slides that bitmap
 * with a Web Animations transform, which Chrome runs off the main thread. A
 * blocked thread cannot touch it. The camera catches up in one step at the
 * end.
 *
 * Two things make that legitimate rather than a trick. A pan holds the zoom
 * fixed, so every frame of it really is the same picture at a different
 * offset. And the bitmap is painted to cover the union of where the view
 * starts and where it ends, so there is no uncovered edge to slide into at any
 * point of the move — which is the usual reason this approach is rejected.
 */

/** Where the bitmap's top-left sits, in canvas px, at each end of the move. */
export interface PanPlan {
  /** Already painted, at device resolution, by the renderer. */
  bitmap: HTMLCanvasElement;
  /** The bitmap's size in CSS px — `bitmap.width / dpr`, passed rather than
      recomputed so the overlay never has to know the device ratio. */
  cssWidth: number;
  cssHeight: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  durationMs: number;
  /** The camera translation the bitmap was painted at. The overlay does not
      use it — it travels back with the plan so the renderer can turn a
      stopped slide's offset into a camera without re-deriving the geometry. */
  origin: { x: number; y: number };
}

/** Fast out of the gate, settling into place: the move answers the tap at once
    and then arrives, rather than easing in and reading as hesitant. */
const EASING = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

/** How long past the slide's own duration to wait before ending it anyway.

    Belt to the `visibilitychange` braces below. The overlay is a picture
    covering the live canvas, so an animation that never reports finishing
    leaves the graph frozen behind it — a failure worth a timer even though the
    known cause is handled. */
const FINISH_SLACK_MS = 150;

export class PanOverlay {
  private el: HTMLCanvasElement | null = null;
  private anim: Animation | null = null;
  private from = { x: 0, y: 0 };
  /** Removes the two safety nets below. Null when nothing is running. */
  private detach: (() => void) | null = null;
  /** A positioned, clipping ancestor of the graph canvas — the overlay is
      sized past the viewport on purpose and relies on it to clip. */
  private host: HTMLElement;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  /**
   * Mount the bitmap and slide it. `onFinish` fires once, on arrival only —
   * `stop` is silent, because whoever calls it is taking the camera over.
   */
  start(plan: PanPlan, onFinish: () => void) {
    this.stop();

    /* A hidden document does not advance the animation timeline at all: the
       slide sits at its first frame with `playState` still reporting
       "running", and `onfinish` never comes. Mounting an overlay into that
       pins a stale picture over the graph until the tab is looked at again.
       Nobody is watching a hidden tab, so there is nothing to animate for —
       take the move in one step. */
    if (document.visibilityState === 'hidden') {
      onFinish();
      return;
    }

    const el = document.createElement('canvas');
    el.width = plan.bitmap.width;
    el.height = plan.bitmap.height;
    el.getContext('2d')?.drawImage(plan.bitmap, 0, 0);
    // Inline rather than in the stylesheet: every value here is computed per
    // pan, and a rule that only ever applies to an element built in this file
    // is harder to find from here than the four lines it replaces.
    el.style.cssText =
      `position:absolute;left:0;top:0;` +
      `width:${plan.cssWidth}px;height:${plan.cssHeight}px;` +
      // The canvas below is what answers taps; this is a picture of it.
      `pointer-events:none;will-change:transform;`;
    // Behind the header, the reading sheet and the topic list, all of which
    // come later in the page's DOM order — and in front of the live canvas,
    // which it is standing in for.
    this.host.insertBefore(el, this.host.firstChild?.nextSibling ?? null);

    this.from = plan.from;
    const anim = el.animate(
      [
        { transform: `translate(${plan.from.x}px, ${plan.from.y}px)` },
        { transform: `translate(${plan.to.x}px, ${plan.to.y}px)` },
      ],
      { duration: plan.durationMs, easing: EASING, fill: 'forwards' },
    );
    this.el = el;
    this.anim = anim;

    const settle = () => {
      // Guard against a `stop`, or a second net, that raced this one.
      if (this.anim !== anim) return;
      this.teardown();
      onFinish();
    };
    anim.onfinish = settle;

    // The same freeze as above, arriving mid-slide — the tab backgrounded, the
    // phone locked. End the move rather than leave the overlay to be found
    // still covering the graph on the way back.
    const onHide = () => {
      if (document.visibilityState === 'hidden') settle();
    };
    document.addEventListener('visibilitychange', onHide);
    const timer = window.setTimeout(settle, plan.durationMs + FINISH_SLACK_MS);
    this.detach = () => {
      document.removeEventListener('visibilitychange', onHide);
      clearTimeout(timer);
    };
  }

  /**
   * How far the slide actually got, in the same units as `PanPlan.from`/`to`.
   *
   * Read off the live transform rather than off the clock, because the clock
   * is not what drove it — a compositor animation may be a frame or two ahead
   * of anything the main thread believes. Null when nothing is running.
   */
  offset(): { x: number; y: number } | null {
    if (!this.el || !this.anim) return null;
    const m = new DOMMatrixReadOnly(getComputedStyle(this.el).transform);
    // `none` parses to the identity, which is the start of a move that has not
    // had its first composited frame yet — not a completed one.
    if (m.isIdentity) return { ...this.from };
    return { x: m.e, y: m.f };
  }

  /** Stop where it is and unmount. `onFinish` does not fire. */
  stop() {
    if (!this.anim) return;
    this.anim.onfinish = null;
    this.anim.cancel();
    this.teardown();
  }

  private teardown() {
    this.detach?.();
    this.detach = null;
    this.el?.remove();
    // Release the bitmap: at device resolution this is tens of megabytes, and
    // it has no reason to outlive the move it was painted for.
    if (this.el) {
      this.el.width = 0;
      this.el.height = 0;
    }
    this.el = null;
    this.anim = null;
  }
}
