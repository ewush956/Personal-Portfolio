#!/usr/bin/env node
/*
   Tone-rewrite guard for the 25 course parent notes.

   The rewrite in ~/.claude/plans/rewrite-course-notes-tone.md changes prose
   only. Everything a reader or the graph depends on — frontmatter, wikilinks,
   LaTeX, tables, code fences — has to come through byte-identical or
   count-identical. This script diffs each note against its committed version
   in the vault repo and fails on anything that isn't prose.

   It is a floor, not the test. No regex finds a metaphor nobody has written
   down yet, so a clean run still needs the first three sentences of each file
   read by eye.

   Usage:
     node scripts/check-notes.mjs                 # all 25 against HEAD
     node scripts/check-notes.mjs 1               # just batch 1
     VAULT_PATH=/some/vault node scripts/check-notes.mjs
*/

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

const VAULT = realpathSync(process.env.VAULT_PATH ?? 'vault');

/* The 25 course parent notes, grouped as the plan batches them. A node is a
   course iff Computer Science.md links to it, so this list mirrors that index
   and is checked against it below. */
const BATCHES = {
  1: [
    'COMP 1ST YEAR/COMP 1631/INTRODUCTION TO COMPUTER SCIENCE.md',
    'COMP 1ST YEAR/COMP 1633/INTRODUCTION TO COMPUTER SCIENCE 2.md',
    'COMP 2ND YEAR/COMP 2631/INFORMATION STRUCTURES.md',
    'COMP 2ND YEAR/COMP 2633/INTRODUCTION TO SOFTWARE ENGINEERING.md',
  ],
  2: [
    'MATH 1ST YEAR/MATH 1200/CALCULUS 1.md',
    'MATH 2ND YEAR/MATH 2200/CALCULUS 2.md',
    'MATH 3RD YEAR/MATH 3200/MATHEMATICAL METHODS.md',
    'MATH 4TH YEAR/MATH 4199/FOURIER AND COMPLEX ANALYSIS.md',
  ],
  3: [
    'MATH 1ST YEAR/MATH 1203/LINEAR ALGEBRA.md',
    'MATH 2ND YEAR/MATH 2101/ABSTRACT ALGEBRA.md',
    'MATH 1ST YEAR/MATH 1271/DISCRETE MATH.md',
    'MATH 2ND YEAR/MATH 2234/STATISTICS.md',
  ],
  4: [
    'COMP 2ND YEAR/COMP 2655/COMPUTING MACHINERY.md',
    'COMP 2ND YEAR/COMP 2659/COMPUTING MACHINERY 2.md',
    'COMP 3RD YEAR/COMP 3659/OPERATING SYSTEMS.md',
    'COMP 2ND YEAR/COMP 2613/INTRODUCTION TO COMPUTABILITY.md',
  ],
  5: [
    'COMP 3RD YEAR/COMP 3649/PROGRAMMING PARADIGMS.md',
    'COMP 4TH YEAR/ALGORITHMS AND COMPLEXITY.md',
    'MATH 4TH YEAR/MATH 4111/CRYPTOGRAPHY.md',
  ],
  6: [
    'COMP 4TH YEAR/ARTIFICIAL INTELLIGENCE.md',
    'COMP 4TH YEAR/MACHINE LEARNING.md',
    'COMP 3RD YEAR/COMP 3612/WEB DEVELOPMENT FOR CS.md',
    'Books/THE NEW TURING OMNIBUS.md',
    'Web Interview Prep.md',
    'Leetcode.md',
  ],
};

/* Curriculum positioning. The first sentence has to state what the subject is
   or does; where the course sits in the degree is metadata and belongs in
   ## Related courses. Tested against the pre-rewrite files, where it flags 15
   of 25. */
const POSITIONING =
  /^(The|A) (first |second |data structures |theory |functional programming |directed readings )?(course|sequel|half)\b|^Every other|first year|this degree|in the degree|prerequisite|^Where the/;

/* Figurative constructions from the plan's hit list. Hard failures. */
const FIGURATIVE = [
  'training wheels', 'cashes out', 'cash out', 'cashed out', 'the payoff',
  'the spine', 'sits next to', 'sit next to', 'stops being', 'stops asking',
  'hands you', 'hand you', 'buy you', 'buys you', 'on faith', 'at play',
  'the trick is', 'underneath the language', 'one ladder',
  'goes in two directions', 'the whole thing is',
];

/* Scaffolding and flourishes. Warnings — some have honest uses, but the plan
   asks for all 23 "which is why" to go, so a clean run should show none. */
const SCAFFOLDING = ['which is why', 'downstream of', 'not just', 'at its core', "let's", 'in conclusion'];

/* Sentences about the note's own rhetoric rather than about the subject.
   "The framing is comparative" tells a reader nothing about programming; the
   claim it was avoiding was that C, Java, Assembly and JavaScript share one
   execution model. A regex cannot tell a gesture from a claim, so these are
   warnings: check that each hit lands a point instead of pointing at one. */
const META = [
  'the framing', 'the through-line', 'hangs off', 'earns its place',
  'the thing to learn', 'worth carrying', 'worth holding', 'the actual skill',
  'is really teaching', 'the punchline', 'says so out loud', 'is the big one',
  'the point of the', 'the organising idea',
];

// ---------------------------------------------------------------------------

/* Word-bounded, so "what plays the role of division" is not an "at play". */
const phraseRe = (p) => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
const FIGURATIVE_RE = FIGURATIVE.map((p) => [p, phraseRe(p)]);
const SCAFFOLDING_RE = SCAFFOLDING.map((p) => [p, phraseRe(p)]);
const META_RE = META.map((p) => [p, phraseRe(p)]);

const CODE_FENCE = /^\s*(```|~~~)/;

/** Blank out fenced code and inline code spans; prose checks run on the rest.
    Fences and inline spans keep their line count so line numbers stay true. */
function proseOnly(text) {
  let inFence = false;
  return text.split('\n').map((line) => {
    if (CODE_FENCE.test(line)) { inFence = !inFence; return ''; }
    if (inFence) return '';
    return line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
  });
}

function frontmatter(text) {
  const m = text.match(/^---\n[\s\S]*?\n---\n/);
  return m ? m[0] : '';
}

/** Raw wikilink bodies, alias pipe and all. Rule 2: byte-identical. */
function links(text) {
  return [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
}

function multiset(arr) {
  const m = new Map();
  for (const v of arr) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

function counts(text) {
  const lines = text.split('\n');
  return {
    fences: lines.filter((l) => CODE_FENCE.test(l)).length,
    tableRows: lines.filter((l) => /^\s*\|/.test(l)).length,
    dollars: (text.match(/\$/g) ?? []).length,
    headings: lines.filter((l) => /^#{1,6}\s/.test(l)).map((l) => l.trim()),
  };
}

/** First prose sentence after the frontmatter, skipping headings and blanks. */
function firstSentence(text) {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || CODE_FENCE.test(t)) continue;
    const cut = t.match(/^.*?[.!?](\s|$)/);
    return (cut ? cut[0] : t).trim();
  }
  return '';
}

// ---------------------------------------------------------------------------

const only = process.argv[2];
const files = only ? BATCHES[only] : Object.values(BATCHES).flat();
if (!files) {
  console.error(`No batch "${only}". Batches are 1-6, or pass nothing for all 25.`);
  process.exit(2);
}

/* The course list has to stay in step with the index note, or this script
   silently stops checking a file the graph still treats as a course. */
if (!only) {
  const index = readFileSync(join(VAULT, 'Computer Science.md'), 'utf8');
  const indexed = new Set(
    [...index.matchAll(/^- \*\*\[\[([^\]]+)\]\]\*\*/gm)].map((m) => {
      const raw = m[1].split('|')[0];
      return raw.split('/').pop();
    }),
  );
  const listed = new Set(files.map((f) => f.split('/').pop().replace(/\.md$/, '')));
  const missing = [...indexed].filter((n) => !listed.has(n));
  const extra = [...listed].filter((n) => !indexed.has(n));
  if (missing.length || extra.length) {
    console.error('FATAL: BATCHES is out of step with Computer Science.md');
    if (missing.length) console.error(`  indexed but unchecked: ${missing.join(', ')}`);
    if (extra.length) console.error(`  checked but not indexed: ${extra.join(', ')}`);
    process.exit(2);
  }
}

let failures = 0;
let warnings = 0;

for (const rel of files) {
  const abs = join(VAULT, rel);
  const problems = [];
  const notes = [];

  if (!existsSync(abs)) {
    console.log(`\n✗ ${rel}\n    file is missing`);
    failures++;
    continue;
  }

  const now = readFileSync(abs, 'utf8');
  let before;
  try {
    before = execFileSync('git', ['-C', VAULT, 'show', `HEAD:${rel}`], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    problems.push('not in HEAD — commit the vault baseline before rewriting');
    before = null;
  }

  if (before !== null) {
    if (frontmatter(now) !== frontmatter(before)) {
      problems.push('frontmatter changed (rule 1: untouched, both keys, every list value)');
    }

    const a = multiset(links(before));
    const b = multiset(links(now));
    for (const [k, n] of a) {
      if (!b.has(k)) problems.push(`wikilink lost: [[${k}]]`);
      else if (b.get(k) !== n) notes.push(`wikilink count [[${k}]]: ${n} → ${b.get(k)}`);
    }
    for (const k of b.keys()) {
      if (!a.has(k)) problems.push(`wikilink added: [[${k}]]`);
    }

    const ca = counts(before);
    const cb = counts(now);
    for (const key of ['fences', 'tableRows', 'dollars']) {
      if (ca[key] !== cb[key]) problems.push(`${key}: ${ca[key]} → ${cb[key]}`);
    }
    const ha = ca.headings.join('\n');
    const hb = cb.headings.join('\n');
    if (ha !== hb) {
      const gone = ca.headings.filter((h) => !cb.headings.includes(h));
      const added = cb.headings.filter((h) => !ca.headings.includes(h));
      for (const h of gone) notes.push(`heading removed: ${h}`);
      for (const h of added) notes.push(`heading added: ${h}`);
      if (!gone.length && !added.length) notes.push('heading order changed');
    }
  }

  const prose = proseOnly(now);
  prose.forEach((line, i) => {
    const n = i + 1;
    if (line.includes(';')) problems.push(`${n}: semicolon in prose`);
    if (line.includes('—')) problems.push(`${n}: em dash in prose`);
    if (/\bEvan\b/i.test(line)) problems.push(`${n}: self-reference "Evan"`);
    const you = line.match(/\b(you|your|yours|yourself)\b/i);
    if (you) problems.push(`${n}: second person "${you[0]}"`);
    for (const [p, re] of FIGURATIVE_RE) {
      if (re.test(line)) problems.push(`${n}: figurative "${p}"`);
    }
    for (const [p, re] of SCAFFOLDING_RE) {
      if (re.test(line)) notes.push(`${n}: scaffolding "${p}"`);
    }
    for (const [p, re] of META_RE) {
      if (re.test(line)) notes.push(`${n}: meta-commentary "${p}" — does it land the point?`);
    }
  });

  const first = firstSentence(now);
  if (POSITIONING.test(first)) {
    problems.push(`opening is curriculum positioning: "${first}"`);
  }

  failures += problems.length;
  warnings += notes.length;

  const mark = problems.length ? '✗' : notes.length ? '!' : '✓';
  console.log(`\n${mark} ${rel}`);
  if (!problems.length && !notes.length) console.log(`    ${first}`);
  for (const p of problems) console.log(`    FAIL  ${p}`);
  for (const n of notes) console.log(`    warn  ${n}`);
}

console.log(
  `\n${files.length} file(s): ${failures} failure(s), ${warnings} warning(s).`,
);
console.log('A clean run is a floor. Read the first three sentences of every file.');
process.exit(failures ? 1 : 0);
