/// <reference lib="webworker" />
/* ==========================================================================
   Force simulation, off the main thread.

   The layout is already solved at build time, so this starts at equilibrium
   with alpha 0 — frozen, costing nothing. Dragging a node re-heats it locally;
   letting go lets it settle and the loop stops again. Idle CPU is zero, which
   is what makes live physics affordable on a phone.

   Positions come back as a copied Float32Array rather than a transferred one.
   836 nodes is 6.7 KB per tick — structured-cloning that is far cheaper than
   the buffer ping-pong transfer requires, and it can't be got wrong.
   ========================================================================== */

import { forceSimulation, forceManyBody, forceLink, forceX, forceY, forceCollide } from 'd3-force';
import type { Simulation } from 'd3-force';

interface SimNode {
  index: number;
  degree: number;
  radius: number;
  /** Collision padding — courses reserve much more space than their radius. */
  pad: number;
  /** 0 = note, 1 = course, 2 = index. */
  kind: number;
  /** Spiral slot for a course: where it is pinned, and where a drag returns it. */
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface SimLink {
  source: number | SimNode;
  target: number | SimNode;
}

export type SimIn =
  | {
      type: 'init';
      positions: Float32Array;
      edges: Int32Array;
      degrees: Int32Array;
      /** 0 = note, 1 = course, 2 = index. Drives collision spacing and the pins. */
      kinds: Uint8Array;
      pinned: number;
    }
  | { type: 'drag'; id: number; x: number; y: number }
  | { type: 'release'; id: number }
  | { type: 'stop' };

export interface SimOut {
  type: 'tick';
  positions: Float32Array;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let sim: Simulation<SimNode, SimLink> | null = null;
let nodes: SimNode[] = [];
let pinned = -1;

function post() {
  const out = new Float32Array(nodes.length * 2);
  for (let i = 0; i < nodes.length; i++) {
    out[i * 2] = nodes[i].x;
    out[i * 2 + 1] = nodes[i].y;
  }
  ctx.postMessage({ type: 'tick', positions: out } satisfies SimOut);
}

ctx.onmessage = (e: MessageEvent<SimIn>) => {
  const msg = e.data;

  if (msg.type === 'init') {
    const count = msg.positions.length / 2;
    nodes = Array.from({ length: count }, (_, i) => ({
      index: i,
      degree: msg.degrees[i],
      radius: 1.8 + Math.pow(msg.degrees[i], 0.58) * 1.2,
      // Mirrors SPACING in scripts/build-graph.mjs. Index gets a moat so it
      // can't be mis-clicked, courses enough room not to merge, notes just
      // enough that no two discs ever overlap.
      pad: msg.kinds[i] === 2 ? 60 : msg.kinds[i] === 1 ? 34 : 2,
      kind: msg.kinds[i],
      homeX: msg.positions[i * 2],
      homeY: msg.positions[i * 2 + 1],
      x: msg.positions[i * 2],
      y: msg.positions[i * 2 + 1],
    }));

    const links: SimLink[] = [];
    for (let i = 0; i < msg.edges.length; i += 2) {
      links.push({ source: msg.edges[i], target: msg.edges[i + 1] });
    }

    pinned = msg.pinned;
    nodes[pinned].fx = nodes[pinned].x;
    nodes[pinned].fy = nodes[pinned].y;

    // Courses hold their spiral slot. build-graph.mjs pinned them onto the
    // spiral to solve the layout, so the shipped coordinates *are* the spiral —
    // re-pinning here needs no radius, angle or turn count of its own, and
    // nothing can drift out of step with the build. A course still drags; it
    // returns to its slot on release, so the frame cannot be pulled out of
    // shape.
    for (const n of nodes) {
      if (n.kind === 1) {
        n.fx = n.homeX;
        n.fy = n.homeY;
      }
    }

    // Mirrors scripts/build-graph.mjs exactly. If these drift apart the graph
    // visibly lurches on first drag as it settles into a different equilibrium.
    sim = forceSimulation<SimNode, SimLink>(nodes)
      .force('charge', forceManyBody<SimNode>().strength(-140).distanceMax(3000))
      .force(
        'link',
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.index)
          .distance(110)
          .strength(0.35),
      )
      .force('x', forceX<SimNode>(0).strength((d) => (d.degree === 0 ? 0.3 : 0.02)))
      .force('y', forceY<SimNode>(0).strength((d) => (d.degree === 0 ? 0.3 : 0.02)))
      .force('collide', forceCollide<SimNode>().radius((d) => d.radius + d.pad).iterations(3).strength(1))
      .alpha(0)
      .alphaTarget(0)
      .stop();

    sim.on('tick', post);
    return;
  }

  if (!sim) return;

  if (msg.type === 'drag') {
    const n = nodes[msg.id];
    if (!n) return;
    n.fx = msg.x;
    n.fy = msg.y;
    // Re-heat only enough for the neighbourhood to respond; the rest of the
    // graph barely moves because it is already at rest.
    if (sim.alpha() < 0.25) sim.alpha(0.3);
    sim.alphaTarget(0.3).restart();
    return;
  }

  if (msg.type === 'release') {
    const n = nodes[msg.id];
    if (n && msg.id !== pinned) {
      // Courses snap back to their spiral slot; notes are simply let go.
      n.fx = n.kind === 1 ? n.homeX : null;
      n.fy = n.kind === 1 ? n.homeY : null;
    }
    // Let it coast to a stop. d3 stops its own timer once alpha decays below
    // alphaMin, so no polling and no idle work.
    sim.alphaTarget(0);
    return;
  }

  if (msg.type === 'stop') {
    sim.stop();
    sim = null;
  }
};
