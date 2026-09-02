#!/usr/bin/env node
/* ==========================================================================
   Graph → per-theme preview PNGs for the Education card.

     node scripts/render-preview.mjs        (runs as part of npm run graph:sync)

   Reads the solved layout from public/graph/graph.json and the palettes from
   the theme CSS itself, so the card art and the live graph can never disagree.
   Regenerated on every sync, so it cannot drift from the real layout.
   ========================================================================== */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { TOPIC_IDS } from './topics.mjs';

const THEME_DIR = 'src/themes/definitions';
const GRAPH = 'public/graph/graph.json';
const OUT_DIR = 'public/images';

const W = 1400;
const H = 1000;
const PAD = 48;

/** Pull every --graph-* declaration out of a theme file. */
function readTokens(themeId) {
  const css = readFileSync(join(THEME_DIR, `${themeId}.css`), 'utf8');
  const tokens = {};
  for (const m of css.matchAll(/--(graph-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    tokens[m[1]] = m[2].trim();
  }
  return tokens;
}

const graph = JSON.parse(readFileSync(GRAPH, 'utf8'));
const { nodes, edges, indexId } = graph;

// Fit the layout into the frame. Percentile bounds rather than absolute min/max
// so a couple of far-flung orphans can't shrink the whole graph to a dot.
const xs = nodes.map((n) => n.x).sort((a, b) => a - b);
const ys = nodes.map((n) => n.y).sort((a, b) => a - b);
const q = (arr, p) => arr[Math.floor((arr.length - 1) * p)];
const minX = q(xs, 0.005);
const maxX = q(xs, 0.995);
const minY = q(ys, 0.005);
const maxY = q(ys, 0.995);

const scale = Math.min((W - PAD * 2) / (maxX - minX), (H - PAD * 2) / (maxY - minY));
const offX = W / 2 - ((minX + maxX) / 2) * scale;
const offY = H / 2 - ((minY + maxY) / 2) * scale;

const px = (n) => n.x * scale + offX;
const py = (n) => n.y * scale + offY;

/** Node radius: degree-driven, with the index and course ring pushed up. */
function radius(n) {
  if (n.kind === 'index') return 26;
  if (n.kind === 'course') return 10 + Math.sqrt(n.degree) * 0.7;
  return 1.8 + Math.pow(n.degree, 0.58) * 1.2;
}

/**
 * Fill, then outline in the background color. Adjacent course nodes otherwise
 * merge into a single amoeba; the ring is what keeps them countable.
 */
function dot(ctx, n, fill, bg) {
  ctx.beginPath();
  ctx.arc(px(n), py(n), radius(n), 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = bg;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

const themes = readdirSync(THEME_DIR)
  .filter((f) => f.endsWith('.css') && !f.startsWith('_'))
  .map((f) => f.replace(/\.css$/, ''));

for (const theme of themes) {
  const t = readTokens(theme);
  if (!t['graph-bg']) {
    console.warn(`  ${theme}: no --graph-* tokens, skipped`);
    continue;
  }

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = t['graph-bg'];
  ctx.fillRect(0, 0, W, H);

  // All links in one path, one stroke — the same batching the live renderer
  // uses. Thin and translucent, so structure reads without the mesh dominating.
  ctx.beginPath();
  for (let i = 0; i < edges.length; i += 2) {
    const a = nodes[edges[i]];
    const b = nodes[edges[i + 1]];
    ctx.moveTo(px(a), py(a));
    ctx.lineTo(px(b), py(b));
  }
  ctx.strokeStyle = t['graph-link'];
  ctx.lineWidth = 0.6;
  ctx.stroke();

  // Notes, then the course ring, then the index — painted back to front so the
  // structural nodes are never buried under the noise.
  const bg = t['graph-bg'];

  for (const n of nodes) {
    if (n.kind !== 'note') continue;
    const i = TOPIC_IDS.indexOf(n.topic);
    dot(ctx, n, i === -1 ? t['graph-node-dim'] : t[`graph-topic-${i + 1}`], bg);
  }
  for (const n of nodes) {
    if (n.kind === 'course') dot(ctx, n, t['graph-node-course'], bg);
  }
  dot(ctx, nodes[indexId], t['graph-node-index'], bg);

  // JPEG, not PNG: antialiased circles defeat PNG's palette compression and
  // push each frame past half a megabyte. This is decorative card art behind
  // text, so quality 86 is indistinguishable and roughly 5x smaller.
  const buf = canvas.toBuffer('image/jpeg', 86);
  const out = join(OUT_DIR, `graph-preview-${theme}.jpg`);
  writeFileSync(out, buf);
  console.log(`  ${theme.padEnd(13)} → ${out}  (${(buf.length / 1024).toFixed(0)} KB)`);
}
