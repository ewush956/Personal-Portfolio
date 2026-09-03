/* ==========================================================================
   Topic bucketing for the graph view.

   The vault carries 513 distinct topic tags, 418 of which appear exactly once,
   so buckets cannot be derived from the tag set — they are curated here.

   Twelve buckets. The first ten cover the CS and mathematics core; the last two
   were added for the physics/astronomy electives and the ethics course, which
   the core ten had no honest home for. Each maps to --graph-topic-<n> in the
   theme token contract. Twelve is past the point where every colour reads as
   distinct on the narrower palettes (Doom, Hacker Bro), so treat it as full.

   A node can belong to several buckets at once, and the filter shows it if any
   one of them is enabled. Resolution order (see resolveTopics below):
     1. every bucket its frontmatter tags hit  (65% of notes are tagged)
     2. its course folder, if none did          (carries the other ~280)
   Course nodes bypass both and use the curated COURSE_TOPICS map instead.
   ========================================================================== */

/** Bucket id → { label, token } — order defines the --graph-topic-N index. */
export const TOPICS = [
  { id: 'math-analysis', label: 'Calculus & Analysis' },
  { id: 'math-algebra', label: 'Linear & Abstract Algebra' },
  { id: 'math-stats', label: 'Probability & Statistics' },
  { id: 'ml-ai', label: 'Machine Learning & AI' },
  { id: 'theory', label: 'Theory of Computation' },
  { id: 'algorithms', label: 'Algorithms & Data Structures' },
  { id: 'systems', label: 'Systems & Architecture' },
  { id: 'web', label: 'Web, Networks & Data' },
  { id: 'security', label: 'Security & Cryptography' },
  { id: 'languages', label: 'Languages & Software Design' },
  { id: 'physics-astro', label: 'Physics & Astronomy' },
  { id: 'ethics-society', label: 'Ethics & Society' },
];

export const TOPIC_IDS = TOPICS.map((t) => t.id);

/** 1-based index used to build the --graph-topic-N custom property name. */
export function topicTokenIndex(id) {
  const i = TOPIC_IDS.indexOf(id);
  return i === -1 ? 0 : i + 1;
}

/**
 * Facet tags that say nothing about subject matter. `self-study` in particular
 * marks the Books/ folder, whose notes are really ML and theory concepts —
 * bucketing on it would collapse a genuine cluster into a meaningless one.
 */
const IGNORED_TAGS = new Set([
  'self-study',
  'moc',
  'interview-prep',
  'discipline',
  'type',
  'comp',
  'computer-science',
]);

/** tag → bucket. Covers every tag appearing 2+ times; the tail falls through. */
const TAG_TO_TOPIC = {
  // -- Calculus & Analysis ------------------------------------------------
  calculus: 'math-analysis',
  analysis: 'math-analysis',
  'complex-analysis': 'math-analysis',
  complex: 'math-analysis',
  fourier: 'math-analysis',
  transforms: 'math-analysis',
  signals: 'math-analysis',
  sound: 'math-analysis',
  'spectral-theory': 'math-analysis',
  operators: 'math-analysis',
  series: 'math-analysis',

  // -- Linear & Abstract Algebra -----------------------------------------
  'linear-algebra': 'math-algebra',
  matrices: 'math-algebra',
  vectors: 'math-algebra',
  'vector-spaces': 'math-algebra',
  eigenvalues: 'math-algebra',
  svd: 'math-algebra',
  determinants: 'math-algebra',
  orthogonality: 'math-algebra',
  'least-squares': 'math-algebra',
  transformations: 'math-algebra',
  'group-theory': 'math-algebra',
  'ring-theory': 'math-algebra',
  'field-theory': 'math-algebra',
  'number-theory': 'math-algebra',
  'abstract-algebra': 'math-algebra',

  // -- Probability & Statistics ------------------------------------------
  statistics: 'math-stats',
  probability: 'math-stats',
  'decision-theory': 'math-stats',
  regression: 'math-stats',
  distributions: 'math-stats',

  // -- Machine Learning & AI ---------------------------------------------
  'machine-learning': 'ml-ai',
  'artificial-intelligence': 'ml-ai',
  'neural-networks': 'ml-ai',
  'deep-learning': 'ml-ai',
  classification: 'ml-ai',
  clustering: 'ml-ai',

  // -- Theory of Computation ---------------------------------------------
  'theory-of-computation': 'theory',
  'discrete-math': 'theory',
  complexity: 'theory',
  logic: 'theory',
  automata: 'theory',
  computability: 'theory',

  // -- Algorithms & Data Structures --------------------------------------
  algorithms: 'algorithms',
  'data-structures': 'algorithms',
  sorting: 'algorithms',
  search: 'algorithms',
  graphs: 'algorithms',
  recursion: 'algorithms',
  leetcode: 'algorithms',
  'problem-solving': 'algorithms',

  // -- Systems & Architecture --------------------------------------------
  'operating-systems': 'systems',
  processes: 'systems',
  process: 'systems',
  'process-model': 'systems',
  scheduling: 'systems',
  synchronization: 'systems',
  memory: 'systems',
  ipc: 'systems',
  storage: 'systems',
  'input-output': 'systems',
  'digital-logic': 'systems',
  'computer-architecture': 'systems',
  assembly: 'systems',
  'data-representation': 'systems',
  graphics: 'systems',

  // -- Web, Networks & Data ----------------------------------------------
  web: 'web',
  'web-development': 'web',
  javascript: 'web',
  css: 'web',
  dom: 'web',
  browser: 'web',
  react: 'web',
  frontend: 'web',
  html: 'web',
  http: 'web',
  api: 'web',
  backend: 'web',
  database: 'web',
  networking: 'web',
  server: 'web',
  nodejs: 'web',

  // -- Security & Cryptography -------------------------------------------
  security: 'security',
  cryptography: 'security',
  'public-key-cryptography': 'security',
  'symmetric-cryptography': 'security',
  'classical-cryptography': 'security',
  'hash-functions': 'security',
  ecc: 'security',

  // -- Languages & Software Design ---------------------------------------
  'functional-programming': 'languages',
  cpp: 'languages',
  'software-engineering': 'languages',
  'object-oriented': 'languages',
  oop: 'languages',
  'type-systems': 'languages',
  'programming-languages': 'languages',
  'data-types': 'languages',
  testing: 'languages',
  quality: 'languages',
  design: 'languages',
  build: 'languages',
  debugging: 'languages',
  errors: 'languages',
  performance: 'languages',
  hci: 'languages',
  usability: 'languages',

  // -- Physics & Astronomy -----------------------------------------------
  physics: 'physics-astro',
  mechanics: 'physics-astro',
  astronomy: 'physics-astro',
  astrophysics: 'physics-astro',
  cosmology: 'physics-astro',
  kinematics: 'physics-astro',
  dynamics: 'physics-astro',
  energy: 'physics-astro',
  momentum: 'physics-astro',
  stars: 'physics-astro',
  galaxies: 'physics-astro',

  // -- Ethics & Society --------------------------------------------------
  ethics: 'ethics-society',
  society: 'ethics-society',
  privacy: 'ethics-society',
  law: 'ethics-society',
  policy: 'ethics-society',
};

/**
 * Course folder → bucket. Load-bearing: ~280 notes carry no frontmatter at all,
 * concentrated in COMP 1st–3rd year. A course folder maps cleanly onto a
 * subject, so this is a good deal more accurate than it sounds.
 *
 * `COMP 4TH YEAR` is flat — AI, Machine Learning and Algorithms & Complexity
 * share one directory — so it defaults to ml-ai, which is the majority. Only
 * 11 of its 36 notes are untagged, so the ambiguity has a small blast radius.
 */
const FOLDER_TO_TOPIC = {
  'COMP 1631': 'languages',
  'COMP 1633': 'languages',
  'COMP 2613': 'theory',
  'COMP 2631': 'algorithms',
  'COMP 2633': 'languages',
  'COMP 2655': 'systems',
  'COMP 2659': 'systems',
  'COMP 3309': 'ethics-society',
  'COMP 3553': 'languages',
  'COMP 3612': 'web',
  'COMP 3649': 'languages',
  'COMP 3659': 'systems',
  'MATH 1200': 'math-analysis',
  'MATH 1203': 'math-algebra',
  'MATH 1271': 'theory',
  'MATH 2101': 'math-algebra',
  'MATH 2200': 'math-analysis',
  'MATH 2234': 'math-stats',
  'MATH 2303': 'math-algebra',
  'MATH 3200': 'math-analysis',
  'MATH 4111': 'security',
  'MATH 4199': 'math-analysis',
  'COMP 4299': 'math-stats',
  'PHIL 1179': 'theory',
  'PHYS 1201': 'physics-astro',
  'ASTR 1103': 'physics-astro',
  'COMP 4TH YEAR': 'ml-ai',
  Books: 'ml-ai',
  'Web Interview Prep': 'web',
  Leetcode: 'algorithms',
};

/**
 * Topics for the course nodes, curated by reading each course's own page.
 *
 * A course carries every topic it is *directly* about, most central first — the
 * first entry is what colours the node, all of them are matched by the filter.
 * Deliberately not transitive: Machine Learning leans on linear algebra and
 * statistics and says so, but Statistics is not about machine learning, so it
 * doesn't claim that topic back. Adding weak relations here would quickly make
 * every filter show every course, which defeats the point of filtering.
 */
const COURSE_TOPICS = {
  // -- Computer science -------------------------------------------------
  'INTRODUCTION TO COMPUTER SCIENCE': ['languages'],
  'INTRODUCTION TO COMPUTER SCIENCE 2': ['languages', 'systems'], // C++, memory model
  'INTRODUCTION TO SOFTWARE ENGINEERING': ['languages'],
  'PROGRAMMING PARADIGMS': ['languages', 'theory'], // functional, type systems, lambda calculus
  'INFORMATION STRUCTURES': ['algorithms'],
  'ALGORITHMS AND COMPLEXITY': ['algorithms', 'theory'],
  'INTRODUCTION TO COMPUTABILITY': ['theory'],
  'COMPUTING MACHINERY': ['systems'],
  'COMPUTING MACHINERY 2': ['systems'],
  'OPERATING SYSTEMS': ['systems'],
  'WEB DEVELOPMENT FOR CS': ['web'],
  'ARTIFICIAL INTELLIGENCE': ['ml-ai', 'algorithms'], // A*, best-first, adversarial search
  'MACHINE LEARNING': ['ml-ai', 'math-stats', 'math-algebra'], // loss/probability, matrices, PCA
  'HUMAN COMPUTER INTERACTION': ['languages'], // design and evaluation of the software itself
  'INFORMATION TECHNOLOGY AND SOCIETY': ['ethics-society'],
  'DIRECTED READING': ['math-stats', 'languages'], // risk measures, and the dashboard that ships them

  // -- Mathematics --------------------------------------------------------
  'CALCULUS 1': ['math-analysis'],
  'CALCULUS 2': ['math-analysis'],
  'MATHEMATICAL METHODS': ['math-analysis'],
  'FOURIER AND COMPLEX ANALYSIS': ['math-analysis'],
  'LINEAR ALGEBRA': ['math-algebra'],
  'LINEAR ALGEBRA FOR DATA SCIENCE': ['math-algebra', 'math-stats'], // least squares on real data
  'ABSTRACT ALGEBRA': ['math-algebra'],
  'DISCRETE MATH': ['theory'],
  'SYMBOLIC LOGIC': ['theory'], // propositional and predicate logic, proof procedures
  STATISTICS: ['math-stats'],
  CRYPTOGRAPHY: ['security', 'math-algebra'], // number theory, groups, elliptic curves

  // -- Physics and astronomy ----------------------------------------------
  'CLASSICAL PHYSICS 1': ['physics-astro'],
  'THE UNIVERSE AT LARGE': ['physics-astro'],

  // -- Everything else linked from the index ------------------------------
  'THE NEW TURING OMNIBUS': ['theory', 'algorithms'],
  Leetcode: ['algorithms'],
  'Web Interview Prep': ['web'],
};

/** Curated topics for a course node, or null if it isn't one we know. */
export function courseTopics(title) {
  return COURSE_TOPICS[title] ?? null;
}

/**
 * Resolve a note's topic buckets.
 *
 * Returns *every* bucket the note's tags hit, not just the first. Notes are
 * routinely tagged across subjects — a note tagged `calculus` and
 * `machine-learning` genuinely belongs to both — and filtering on a single
 * bucket made such notes vanish from filters they plainly belong in. The first
 * entry is the primary, used for the node's colour.
 *
 * @param {string[]} tags      frontmatter tags, `year/` and `course/` included
 * @param {string} relPath     vault-relative path, e.g. "COMP 3RD YEAR/COMP 3659/FIFO.md"
 * @param {Set<string>} unmatched  collects tags that hit no bucket, for reporting
 * @returns {{ topics: string[], via: 'tag' | 'folder' | 'default' }}
 */
export function resolveTopics(tags, relPath, unmatched) {
  const hits = [];
  for (const raw of tags) {
    const tag = String(raw).toLowerCase();
    if (tag.startsWith('year/') || tag.startsWith('course/')) continue;
    if (IGNORED_TAGS.has(tag)) continue;
    const hit = TAG_TO_TOPIC[tag];
    if (hit) {
      if (!hits.includes(hit)) hits.push(hit);
    } else {
      unmatched?.add(tag);
    }
  }
  if (hits.length) return { topics: hits, via: 'tag' };

  // Longest matching path segment wins, so "COMP 3659" beats "COMP 4TH YEAR".
  for (const seg of relPath.split('/')) {
    if (FOLDER_TO_TOPIC[seg]) return { topics: [FOLDER_TO_TOPIC[seg]], via: 'folder' };
  }

  return { topics: [], via: 'default' };
}
