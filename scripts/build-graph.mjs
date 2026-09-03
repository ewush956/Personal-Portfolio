#!/usr/bin/env node
/* ==========================================================================
   Obsidian vault → graph artifacts.

     node scripts/build-graph.mjs        (or: npm run graph:sync)

   Reads the vault (VAULT_PATH, default ./vault), parses wikilinks and
   frontmatter, buckets notes by topic, solves the force layout once, and
   writes what the site actually ships:

     public/graph/graph.json          nodes + edges + solved coordinates
     public/graph/notes/<slug>.json   one note body each, fetched on demand

   The vault itself is gitignored. These artifacts are committed, so CI never
   needs the vault and the exclusions below are the real publishing boundary.
   ========================================================================== */

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename, sep } from 'node:path';
import matter from 'gray-matter';
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceX,
  forceY,
  forceCollide,
} from 'd3-force';
import { resolveTopics, courseTopics, TOPICS, TOPIC_IDS } from './topics.mjs';

const VAULT = process.env.VAULT_PATH ?? 'vault';
const OUT_DIR = 'public/graph';
const NOTES_DIR = join(OUT_DIR, 'notes');

/** The apex note. Its outbound links define the course ring. */
const INDEX_NOTE = 'Computer Science';

/** Directories and file patterns that are vault machinery, not content. */
const EXCLUDED_DIRS = new Set([
  '_meta',
  '.claude',
  '.obsidian',
  '.git',
  '.trash',
  'textgenerator',
  'Excalidraw',
  'Screenshots',
  // Raw syllabus dumps pasted in while drafting a course index. Working
  // material for the Obsidian side only — unlinked, so they shipped as
  // uncoloured orphan nodes.
  'inputCourses',
]);
const EXCLUDED_FILE_RE = /\.excalidraw\.md$|\.base$/;

/** Notes deliberately kept off the public site. */
const EXCLUDED_NOTES = new Set([
  'bazaarvoice-technical-deep-dive',
  'Work Integrated Learning',
  // Vault-maintenance instructions for Claude Code, not coursework.
  'CLAUDE',
  // Linked from the index but it's a personal ML project, not a course.
  'MuddyBoots',
]);

/**
 * Applied to every note body before it ships. Each entry MUST still match
 * something, or the build fails — a future vault edit can't silently
 * re-expose what we redacted here.
 */
const REDACTIONS = [
  // Order matters: the specific login form is matched before the bare username,
  // so the host is redacted too rather than left behind.
  {
    name: 'school ssh login',
    re: /ewush956@ins\.mtroyal\.ca/g,
    with: '<user>@<school-host>',
  },
  {
    name: 'school username',
    re: /ewush956/g,
    with: '<user>',
  },
  // Two web-dev notes use a real company's domain for URL-anatomy examples.
  // The example teaches identically with a neutral host, and leaving it in
  // would signal the same interview target the excluded note was dropped for.
  {
    name: 'interview-target domain',
    re: /bazaarvoice/gi,
    with: 'example',
  },
];

// --------------------------------------------------------------------------
// Deterministic randomness. d3-force reaches for Math.random to jiggle
// coincident nodes and to seed unplaced ones; without this the layout would
// reshuffle on every sync and every re-run would look like a different vault.
// --------------------------------------------------------------------------
function mulberry32(seed) {
  return function rand() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withSeededRandom(seed, fn) {
  const real = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

// --------------------------------------------------------------------------
// Walk
// --------------------------------------------------------------------------
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (EXCLUDED_DIRS.has(entry)) continue;
      walk(full, acc);
    } else if (entry.endsWith('.md') && !EXCLUDED_FILE_RE.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

// --------------------------------------------------------------------------
// Wikilinks. The vault is 100% wikilink-based: 12,578 of them, 611 aliased,
// zero heading anchors, zero block refs. Targets resolve by basename because
// the vault contains exactly one duplicate basename and it lives in _meta/.
// --------------------------------------------------------------------------
const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

/**
 * Code must not contribute edges. Mermaid's subroutine shape is `id[[label]]`,
 * which is indistinguishable from a wikilink to the regex above, and C-family
 * snippets can produce `arr[[i]]` the same way.
 */
function stripCode(body) {
  return body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

function extractLinks(body) {
  const out = [];
  for (const m of stripCode(body).matchAll(WIKILINK_RE)) {
    // Inside markdown tables the alias pipe is escaped as `\|` (55 links do
    // this). Unescape first, or the target keeps a trailing backslash and
    // resolves to nothing.
    const inner = m[1].replace(/\\\|/g, '|');
    const target = inner.split('|')[0].split('#')[0].split('^')[0].trim();
    if (!target) continue;
    // Cross-folder links appear as full paths: take the last segment.
    const name = target.split('/').pop();
    if (name) out.push(name);
  }
  return out;
}

function slugify(name) {
  return (
    name
      .toLowerCase()
      .replace(/\+/g, '-plus')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'note'
  );
}

/** Short, stable hash of a string. Used only to disambiguate slugs. */
function shortHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).slice(0, 5);
}

// --------------------------------------------------------------------------
// Parse
// --------------------------------------------------------------------------
console.log(`Reading vault: ${VAULT}`);
const files = walk(VAULT);
console.log(`  ${files.length} markdown files after directory exclusions`);

const redactionHits = new Map(REDACTIONS.map((r) => [r.name, 0]));
const notes = [];
let skippedExcluded = 0;

for (const file of files) {
  const rel = relative(VAULT, file).split(sep).join('/');
  const name = basename(file, '.md');

  if (EXCLUDED_NOTES.has(name)) {
    skippedExcluded++;
    continue;
  }

  const raw = readFileSync(file, 'utf8');
  let parsed;
  try {
    parsed = matter(raw);
  } catch {
    // A malformed YAML block shouldn't take the whole build down.
    parsed = { data: {}, content: raw };
  }

  let body = parsed.content;
  for (const r of REDACTIONS) {
    const before = body;
    body = body.replace(r.re, r.with);
    if (body !== before) {
      redactionHits.set(r.name, redactionHits.get(r.name) + 1);
    }
  }

  const tags = Array.isArray(parsed.data?.tags)
    ? parsed.data.tags.filter((t) => typeof t === 'string')
    : [];
  const aliases = Array.isArray(parsed.data?.aliases)
    ? parsed.data.aliases.filter((a) => typeof a === 'string')
    : [];

  /* A course's number. Almost every course carries it in its folder path and
     needs nothing here; this is the override for the handful filed without a
     numbered folder of their own, where the vault has nowhere else to put it.
     Add `code: COMP 4677` to the course note's frontmatter and it shows up in
     the reading panel like every other course's does. */
  const code = typeof parsed.data?.code === 'string' ? parsed.data.code.trim() : null;

  notes.push({ name, rel, tags, aliases, code, body, links: extractLinks(body) });
}

console.log(`  ${skippedExcluded} notes excluded by name`);

// Redactions must still bite.
for (const [name, hits] of redactionHits) {
  if (hits === 0) {
    console.error(
      `\nFATAL: redaction "${name}" matched nothing.\n` +
        `Either the vault changed and it is no longer needed (remove it from\n` +
        `REDACTIONS), or the pattern drifted and something private is about to\n` +
        `ship. Not guessing which.`,
    );
    process.exit(1);
  }
  console.log(`  redaction "${name}": ${hits} note(s)`);
}

// --------------------------------------------------------------------------
// Resolve links
// --------------------------------------------------------------------------
const byName = new Map();
for (const [i, n] of notes.entries()) {
  byName.set(n.name.toLowerCase(), i);
  for (const alias of n.aliases) {
    if (!byName.has(alias.toLowerCase())) byName.set(alias.toLowerCase(), i);
  }
}

const indexIdx = byName.get(INDEX_NOTE.toLowerCase());
if (indexIdx === undefined) {
  console.error(`FATAL: index note "${INDEX_NOTE}.md" not found in the vault.`);
  process.exit(1);
}

// Course nodes are exactly the index note's resolvable outbound links.
const courseIdx = new Set();
const unresolvedFromIndex = [];
for (const target of notes[indexIdx].links) {
  const hit = byName.get(target.toLowerCase());
  if (hit === undefined) unresolvedFromIndex.push(target);
  else if (hit !== indexIdx) courseIdx.add(hit);
}

/**
 * Course level, which is what orders the spiral: 1200 is a first-level course,
 * 4111 a fourth. Taken from the numbered folder the note sits in.
 *
 * The subject-year folder (`COMP 4TH YEAR/`) is the fallback for the few
 * courses filed without a number of their own, and null for the notes that
 * aren't coursework at all — those sort to the outer end.
 *
 * Level, not the year it was taken: the index note groups courses by year, and
 * the two disagree often enough to matter. STATISTICS is a 2000-level course
 * taken in first year; ALGORITHMS AND COMPLEXITY is 4000-level taken in third.
 * The spiral is meant to read as difficulty rising with the radius, so the
 * number on the course wins over the year it was slotted into.
 */
function courseLevel(rel) {
  const numbered = rel.match(/\/[A-Z]{4} ?(\d)\d{3}\//);
  if (numbered) return Number(numbered[1]);
  const subjectYear = rel.match(/^[A-Z]{4} (\d)(?:ST|ND|RD|TH) YEAR\//);
  return subjectYear ? Number(subjectYear[1]) : null;
}

/**
 * Tiebreak within a level: the order the index note lists them.
 *
 * Only links under a `## ` heading count. The intro names a few courses out of
 * sequence to make a point about them, and those mentions shouldn't decide
 * where a course lands. A course appearing only in the intro sorts last within
 * its level.
 */
const UNLISTED = Number.MAX_SAFE_INTEGER;
const courseRank = new Map();
{
  let rank = 0;
  let inSection = false;
  for (const line of stripCode(notes[indexIdx].body).split('\n')) {
    if (/^##\s/.test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    for (const target of extractLinks(line)) {
      const hit = byName.get(target.toLowerCase());
      if (hit !== undefined && courseIdx.has(hit) && !courseRank.has(hit)) {
        courseRank.set(hit, rank++);
      }
    }
  }
}

// Dedupe edges: the graph is undirected, so A→B and B→A are one link.
const edgeSet = new Set();
let unresolved = 0;
let totalRefs = 0;
const unresolvedNames = new Map();

for (const [from, n] of notes.entries()) {
  for (const target of n.links) {
    totalRefs++;
    const to = byName.get(target.toLowerCase());
    if (to === undefined) {
      unresolved++;
      unresolvedNames.set(target, (unresolvedNames.get(target) ?? 0) + 1);
      continue;
    }
    if (to === from) continue;
    edgeSet.add(from < to ? `${from},${to}` : `${to},${from}`);
  }
}

const edgePairs = [...edgeSet].map((k) => k.split(',').map(Number));

// --------------------------------------------------------------------------
// Classify + degree
// --------------------------------------------------------------------------
const degree = new Array(notes.length).fill(0);
for (const [a, b] of edgePairs) {
  degree[a]++;
  degree[b]++;
}

const unmatchedTags = new Set();
const viaCount = { tag: 0, folder: 0, default: 0, course: 0 };

/**
 * Slugs, assigned so they cannot move between syncs.
 *
 * Six pairs of notes collapse to the same base slug — "Cryptography" vs
 * "CRYPTOGRAPHY", "Node JS" vs "Node.js" — and an encounter-order counter gave
 * the `-2` to whichever the directory walk happened to reach second. Add or
 * remove any note upstream and the suffix could jump to the other one, breaking
 * every previously-shared URL and any cached graph.json.
 *
 * So: assign in a deterministic order (index, then courses, then notes by path,
 * which also hands the clean URLs to the nodes people actually link to), and
 * disambiguate collisions with a hash of the note's path rather than a counter.
 * A note's slug now depends only on that note.
 */
const kindRank = { index: 0, course: 1, note: 2 };
const slugOf = new Map();
const takenSlugs = new Set();

const slugOrder = notes
  .map((n, i) => ({ i, path: n.rel, kind: i === indexIdx ? 'index' : courseIdx.has(i) ? 'course' : 'note' }))
  .sort((a, b) => kindRank[a.kind] - kindRank[b.kind] || a.path.localeCompare(b.path));

for (const { i, path } of slugOrder) {
  const base = slugify(notes[i].name);
  const slug = takenSlugs.has(base) ? `${base}-${shortHash(path)}` : base;
  takenSlugs.add(slug);
  slugOf.set(i, slug);
}

/**
 * Course index notes are named in caps in the vault (COMPUTING MACHINERY),
 * which shouts on the canvas now that every course carries a visible label.
 * Only all-caps titles are touched, and only for course nodes — a note called
 * FIFO or DMA is an acronym and must survive as one.
 */
const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to']);
const ACRONYMS = new Set(['CS', 'AI', 'ML', 'IT', 'HCI', 'OS', 'UI', 'UX']);

function titleCase(name) {
  if (name !== name.toUpperCase()) return name; // already mixed case, leave it
  return name
    .split(' ')
    .map((word, i) => {
      if (ACRONYMS.has(word)) return word;
      const lower = word.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

const nodes = notes.map((n, i) => {
  const kind = i === indexIdx ? 'index' : courseIdx.has(i) ? 'course' : 'note';

  // Courses use the curated map; notes derive theirs from tags, then folder.
  const fromTags = resolveTopics(n.tags, n.rel, unmatchedTags);
  const topics = kind === 'course' ? (courseTopics(n.name) ?? fromTags.topics) : fromTags.topics;
  viaCount[kind === 'course' ? 'course' : fromTags.via]++;

  const yearTag = n.tags.find((t) => t.toLowerCase().startsWith('year/'));
  const year = yearTag ? Number(yearTag.split('/')[1]) || null : yearFromPath(n.rel);

  const slug = slugOf.get(i);

  return {
    id: i,
    title: kind === 'course' ? titleCase(n.name) : n.name,
    slug,
    path: n.rel,
    kind,
    // `topic` is the primary, and only drives the node's colour. `topics` is
    // what the filter matches against — a node survives if any one is enabled.
    topic: kind === 'note' ? (topics[0] ?? null) : null,
    topics: kind === 'index' ? [] : topics,
    year,
    degree: degree[i],
    /* A course's number, for the line the reading panel puts under a title.
       The numbered folder is the vault's own answer wherever it gives one;
       `code:` in the frontmatter covers the courses filed without one. */
    code: kind === 'course' ? (n.code ?? courseCode(n.rel)) : null,
    /** The course this node belongs to, as a course node id. Filled in below. */
    course: null,
    x: 0,
    y: 0,
  };
});

// --------------------------------------------------------------------------
// Course attribution
// --------------------------------------------------------------------------
/*
 * Which course each node belongs to, as a course node id — the reading panel
 * shows it under the title instead of the vault path (`MATH 4199: Fourier and
 * Complex Analysis`, not `MATH 4TH YEAR/MATH 4199/Fourier Series.md`).
 *
 * Two rules, in order. The filing is authoritative where it says anything: a
 * course owns a folder when it sits in its own numbered one (`MATH 4199/`) or
 * beside a folder of its own name (`Leetcode.md` next to `Leetcode/`), and
 * everything under an owned folder is that course's. Nothing looser counts —
 * `Books/` holds one course note and forty unrelated books, and the three
 * fourth-year COMP courses filed without numbers share a folder with each other
 * and with 33 loose notes, so neither folder speaks for a single course.
 *
 * That leaves ~75 notes, and for those the links decide. It has to be *this*
 * direction — a course naming the note, not the note naming a course — because
 * nearly every note reaches several courses on the way out (`Neural Network`
 * links to Machine Learning, Artificial Intelligence and Statistics) while
 * being claimed by far fewer. `graph.json` can't answer that: its edges are
 * deduped to `min,max` and course ids always sort below note ids, so every
 * course-note pair looks the same by the time it ships. This runs at build
 * time, off the vault, where direction still exists.
 *
 * Claims still overlap — Machine Learning, Artificial Intelligence and The New
 * Turing Omnibus all name `Neural Network` — so they are ranked, and counting
 * mentions of the note alone is not enough to separate them (AI names it three
 * times, ML twice). What separates them is the *neighbourhood*: the winner is
 * the course that names the most of what this note links to, which is the
 * difference between a course mentioning a concept and a course being built out
 * of it. ML names 54 of Neural Network's neighbours against AI's 30. Ties fall
 * to the more direct mention, then to the lower course id, so the result does
 * not depend on map iteration order.
 *
 * A topic filter runs first, and does most of the coarse work: only courses
 * sharing the note's topic bucket are ranked, which drops Calculus 1 and Linear
 * Algebra from `Back Propagation` before any counting happens. If none match,
 * every claimant is ranked instead — that is what leaves `Karnaugh Maps` with
 * The New Turing Omnibus, correctly.
 *
 * Notes no course claims keep their folder's name, resolved in the panel.
 */

const dirOf = (p) => {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
};
const baseOf = (p) => p.slice(p.lastIndexOf('/') + 1).replace(/\.md$/i, '');

const allDirs = new Set();
for (const n of nodes) {
  for (let d = dirOf(n.path); d; d = dirOf(d)) allDirs.add(d.toLowerCase());
}

/** Folder (lowercased) → the course node that owns it. */
const ownedFolders = new Map();
for (const n of nodes) {
  if (n.kind !== 'course') continue;
  const dir = dirOf(n.path);
  // Ownership follows the *folder's* number, not the course's own `code:` — a
  // course given its number in frontmatter has no folder to speak for.
  if (courseCode(n.path)) {
    ownedFolders.set(dir.toLowerCase(), n.id);
  } else {
    const sibling = dir ? `${dir}/${baseOf(n.path)}` : baseOf(n.path);
    if (allDirs.has(sibling.toLowerCase())) ownedFolders.set(sibling.toLowerCase(), n.id);
  }
}

/** Course node id → Map(node id → how often that course's note names it). */
const mentions = new Map();
for (const n of nodes) {
  if (n.kind !== 'course') continue;
  const counts = new Map();
  for (const target of notes[n.id].links) {
    const to = byName.get(target.toLowerCase());
    if (to !== undefined && to !== n.id) counts.set(to, (counts.get(to) ?? 0) + 1);
  }
  mentions.set(n.id, counts);
}

const neighbours = nodes.map(() => []);
for (const [a, b] of edgePairs) {
  neighbours[a].push(b);
  neighbours[b].push(a);
}

/** The course with the strongest claim on a note, or null if none names it. */
function claimant(n) {
  let cands = [];
  for (const [cid, m] of mentions) if (m.has(n.id)) cands.push(cid);
  if (!cands.length) return null;

  const topical = cands.filter((cid) => nodes[cid].topics.includes(n.topic));
  if (topical.length) cands = topical;

  let best = null;
  for (const cid of cands) {
    const m = mentions.get(cid);
    const around = neighbours[n.id].reduce((sum, x) => sum + (m.get(x) ?? 0), 0);
    const direct = m.get(n.id) ?? 0;
    if (!best || around > best.around || (around === best.around && direct > best.direct)) {
      best = { cid, around, direct };
    }
  }
  return best.cid;
}

const viaCourse = { folder: 0, link: 0, none: 0 };
for (const n of nodes) {
  if (n.kind !== 'note') {
    // A course is its own; the index belongs to no course and says so itself.
    n.course = n.kind === 'course' ? n.id : null;
    continue;
  }

  // Deepest owning folder wins: COMP 4299's notes are Directed Reading's, not
  // the fourth-year folder's.
  let course = null;
  for (let d = dirOf(n.path); d && course === null; d = dirOf(d)) {
    course = ownedFolders.get(d.toLowerCase()) ?? null;
  }
  if (course !== null) viaCourse.folder++;
  else {
    course = claimant(n);
    viaCourse[course === null ? 'none' : 'link']++;
  }
  n.course = course;
}

/** `MATH 4TH YEAR/MATH 4199/…` → `MATH 4199`, and null where no folder says. */
function courseCode(rel) {
  const dir = rel.slice(0, rel.lastIndexOf('/'));
  const leaf = dir.slice(dir.lastIndexOf('/') + 1);
  return /^[A-Z]{2,4} ?\d{4}$/.test(leaf) ? leaf : null;
}

function yearFromPath(rel) {
  const m = rel.match(/(COMP|MATH) (\d)(?:ST|ND|RD|TH) YEAR/);
  return m ? Number(m[2]) : null;
}

// --------------------------------------------------------------------------
// Solve the layout once, here, so the page never pays for a cold start.
// --------------------------------------------------------------------------
console.log('Solving force layout…');

const simNodes = nodes.map((n) => ({ id: n.id }));
const simLinks = edgePairs.map(([a, b]) => ({ source: a, target: b }));

withSeededRandom(0x5eed, () => {
  // Phyllotaxis seeding: deterministic, evenly spread, no initial clumping.
  const R = 40;
  for (const [i, sn] of simNodes.entries()) {
    const a = i * 2.399963229728653;
    const r = R * Math.sqrt(i);
    sn.x = Math.cos(a) * r;
    sn.y = Math.sin(a) * r;
  }
  // Pin the index at the origin so the whole graph orbits it.
  simNodes[indexIdx].fx = 0;
  simNodes[indexIdx].fy = 0;

  // Must match GraphRenderer.radius / sim.worker.ts, or the graph lurches on
  // first drag as it settles into a different equilibrium.
  const radius = (d) => 1.8 + Math.pow(nodes[d.id].degree, 0.58) * 1.2;

  // Clearance around each node, on top of its radius.
  //
  // The index gets a moat: it's the one node everybody clicks first, and a note
  // resting against it turns "Start here" into a coin flip. Courses reserve
  // enough room to stop merging into each other. Notes get a small gap, which
  // combined with full-strength collision below means no two discs overlap at
  // all — overlapping notes are indistinguishable and impossible to aim at.
  const SPACING = { index: 60, course: 34, note: 2 };
  const pad = (d) => SPACING[nodes[d.id].kind];

  // Courses are pinned on a spiral winding out from the index.
  //
  // Left to links and charge alone the course hubs clumped to one side, leaving
  // the index in a corner with the whole graph hanging off it. Soft forces do
  // not fix that: `forceRadial` constrains a course's distance from the index
  // but not its bearing, so the clumping survives, and a tangential force that
  // constrains bearing but not distance only balances it roughly. Pinning is
  // what actually holds the arrangement, so the courses are pinned outright,
  // the same way the index is.
  //
  // A constant radius gives a clean ring but every course ends up exactly as
  // far from the index as every other, which reads as mechanical. Growing the
  // radius as the angle advances keeps the even angular spread and the balance
  // around the index, while giving the arrangement depth: each course sits a
  // little further out than the last.
  //
  // TURNS is how many times the spiral wraps. The radius is what does the work
  // on spacing — at TURNS turns, consecutive courses are R_MIN * 2*PI*TURNS/n
  // apart at the tight inner end, so R_MIN is what stops the middle crowding.
  //
  // Order is by course level, so difficulty rises with the radius: the
  // 1000-level courses sit innermost and each turn outward is a level up,
  // ending on the notes that aren't coursework. The cost over the previous
  // primary-topic order is that a note shared between courses levels apart now
  // sits between two distant hubs instead of two neighbouring ones, so the
  // middle carries more long links. Legibility of the arrangement is worth
  // more than shortening those.
  // Sorts the non-coursework notes to the outer end.
  const UNLEVELLED = 99;

  // R_MIN is set by the labels, not by the discs. Every course is named in the
  // survey view and each name hangs directly under its node, so the inner
  // winding has to be long enough to park eight names side by side: at 300 it
  // offered ~800px of circumference for ~1200px of text, and the overflow
  // stacked downward into a starburst of leader lines. 500 seats 25 of 32
  // labels on their first rung at 1440x900, against 17 before.
  const TURNS = 2;
  const R_MIN = 500;
  const R_MAX = 1100;

  const ringOrder = nodes
    .map((n, i) => [n, i])
    .filter(([n]) => n.kind === 'course')
    .sort(
      ([a, ai], [b, bi]) =>
        (courseLevel(a.path) ?? UNLEVELLED) - (courseLevel(b.path) ?? UNLEVELLED) ||
        (courseRank.get(ai) ?? UNLISTED) - (courseRank.get(bi) ?? UNLISTED) ||
        a.title.localeCompare(b.title),
    )
    .map(([, i]) => i);

  for (const [k, id] of ringOrder.entries()) {
    const t = k / ringOrder.length;
    const theta = 2 * Math.PI * TURNS * t;
    const r = R_MIN + (R_MAX - R_MIN) * t;
    simNodes[id].fx = Math.cos(theta) * r;
    simNodes[id].fy = Math.sin(theta) * r;
  }

  const sim = forceSimulation(simNodes)
    .force('charge', forceManyBody().strength(-140).distanceMax(3000))
    .force(
      'link',
      forceLink(simLinks)
        .id((d) => d.id)
        .distance(110)
        .strength(0.35),
    )
    // Not forceCenter: it translates every node so the centroid lands on the
    // origin, which fights the pinned index node and lets the graph drift.
    // Weak positional forces keep the graph bounded while the pin holds.
    //
    // Orphans get a much stronger pull. With no links to anchor them, charge
    // alone flings them into deep space — two notes were sitting at twice the
    // radius of the entire rest of the graph, doubling the bounding box for
    // nothing. Obsidian shows orphans too; it just keeps them at the rim.
    .force('x', forceX(0).strength((d) => (nodes[d.id].degree === 0 ? 0.3 : 0.02)))
    .force('y', forceY(0).strength((d) => (nodes[d.id].degree === 0 ? 0.3 : 0.02)))
    // Light touch. At 2 iterations with generous padding, collision dominates
    // the other forces and packs each cluster into a visibly hexagonal lattice
    // — it reads as a crystal, not a graph. One relaxed pass keeps nodes from
    // overlapping without flattening the organic shape links give them.
    .force('collide', forceCollide().radius((d) => radius(d) + pad(d)).iterations(3).strength(1))
    .stop();

  // 500 ticks with d3's default decay. Alpha is under alphaMin by tick 300, so
  // the tail is nearly free — but annealing slower and longer was tried and is
  // strictly worse: given room to keep moving, the course ring settles into a
  // taller, less circular minimum than the one the default schedule freezes.
  const ticks = 500;
  for (let i = 0; i < ticks; i++) {
    sim.tick();
    if (i % 100 === 0) process.stdout.write(`  tick ${i}/${ticks}\r`);
  }
  process.stdout.write(`  tick ${ticks}/${ticks}\n`);
});

for (const [i, sn] of simNodes.entries()) {
  nodes[i].x = Math.round(sn.x * 10) / 10;
  nodes[i].y = Math.round(sn.y * 10) / 10;
}

// --------------------------------------------------------------------------
// Emit
// --------------------------------------------------------------------------
// Write over the top, then prune what's no longer current.
//
// NOT rm -rf followed by a rebuild: that leaves a window, up to a second wide,
// where public/graph/ does not exist. A dev server handling a request in that
// window falls through to the SPA fallback and answers /graph/graph.json with
// index.html — a cacheable 200 of the wrong content type, which the browser
// then holds onto and replays long after the files are back. Never deleting
// the tree means the window never opens.
mkdirSync(NOTES_DIR, { recursive: true });

/** Shared by graph.json and the generated stats module, so the app can version
    its own fetch of graph.json against the exact sync that produced it. */
const buildId = shortHash(new Date().toISOString() + nodes.length);

const graph = {
  generatedAt: new Date().toISOString(),
  // Cache key for the per-note fetches. Without it a browser can hold an old
  // graph.json alongside freshly-written note files and ask for names that no
  // longer exist.
  buildId,
  indexId: indexIdx,
  topics: TOPICS,
  nodes,
  // Flat index pairs. The runtime builds its own CSR adjacency from these in
  // O(E) at load, which is cheaper than shipping ~100 KB of precomputed offsets.
  edges: edgePairs.flat(),
};

writeFileSync(join(OUT_DIR, 'graph.json'), JSON.stringify(graph));

const wanted = new Set(nodes.map((n) => `${n.slug}.json`));
for (const stale of readdirSync(NOTES_DIR)) {
  if (!wanted.has(stale)) rmSync(join(NOTES_DIR, stale), { force: true });
}

for (const [i, n] of notes.entries()) {
  writeFileSync(
    join(NOTES_DIR, `${nodes[i].slug}.json`),
    JSON.stringify({
      title: nodes[i].title,
      slug: nodes[i].slug,
      path: n.rel,
      tags: n.tags,
      body: n.body.trim(),
    }),
  );
}

// Counts for the Education card, emitted as a module so they are baked in at
// build time. The alternative — fetching graph.json on the home page — would
// pull the whole graph payload onto a page that only needs three numbers.
const courseCount = nodes.filter((n) => n.kind === 'course').length;
writeFileSync(
  'src/data/graphStats.ts',
  `/* Generated by scripts/build-graph.mjs — do not edit by hand. */\n\n` +
    `export const GRAPH_STATS = {\n` +
    `  buildId: '${buildId}',\n` +
    `  notes: ${nodes.length},\n` +
    `  courses: ${courseCount},\n` +
    `  links: ${edgePairs.length},\n` +
    `} as const;\n`,
);

// --------------------------------------------------------------------------
// Report
// --------------------------------------------------------------------------
const graphBytes = statSync(join(OUT_DIR, 'graph.json')).size;

console.log('\n─── Summary ───');
console.log(`nodes            ${nodes.length}`);
console.log(`edges            ${edgePairs.length} unique, from ${totalRefs} wikilink refs`);
console.log(`index nodes      ${nodes.filter((n) => n.kind === 'index').length}`);
console.log(`course nodes     ${courseCount}`);
console.log(
  `note -> course     ${viaCourse.folder} by folder, ${viaCourse.link} by link, ` +
    `${viaCourse.none} unclaimed`,
);
console.log(`unresolved links ${unresolved} across ${unresolvedNames.size} distinct targets`);
console.log(`graph.json       ${(graphBytes / 1024).toFixed(0)} KB`);
console.log(`note files       ${notes.length}`);

console.log('\ntopic assignment:');
console.log(
  `  via tag ${viaCount.tag}   via folder ${viaCount.folder}   ` +
    `curated courses ${viaCount.course}   unbucketed ${viaCount.default}`,
);
const multi = nodes.filter((n) => n.topics.length > 1).length;
console.log(`  ${multi} nodes carry more than one topic`);
const histogram = new Map(TOPIC_IDS.map((t) => [t, 0]));
for (const n of nodes) for (const t of n.topics) histogram.set(t, (histogram.get(t) ?? 0) + 1);
for (const [id, count] of [...histogram].sort((a, b) => b[1] - a[1])) {
  if (count) console.log(`  ${id.padEnd(14)} ${count}`);
}

if (unresolvedFromIndex.length) {
  console.log(`\nindex links that resolve to nothing: ${unresolvedFromIndex.join(', ')}`);
}

const topUnresolved = [...unresolvedNames].sort((a, b) => b[1] - a[1]).slice(0, 8);
if (topUnresolved.length) {
  console.log('\nmost-referenced missing notes:');
  for (const [name, count] of topUnresolved) console.log(`  ${String(count).padStart(3)}  ${name}`);
}

if (unmatchedTags.size) {
  console.log(`\n${unmatchedTags.size} tags matched no bucket (folder fallback covered them).`);
  console.log('  Add any that matter to TAG_TO_TOPIC in scripts/topics.mjs.');
}

// Structural invariants. If these break, something upstream changed.
if (nodes.filter((n) => n.kind === 'index').length !== 1) {
  console.error('\nFATAL: expected exactly 1 index node.');
  process.exit(1);
}
console.log('\nDone.');
