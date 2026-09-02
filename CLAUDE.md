# Personal Portfolio — working notes

React 19 + TypeScript + Vite, deployed to GitHub Pages at `wushke.ca`. Two parts:
the single-page portfolio (`src/components/`) and the Obsidian graph view
(`src/graph/`, route `/graph`).

```bash
npm run dev          # local dev server
npm run build        # tsc -b && vite build
npm run lint         # oxlint
npm run graph:sync   # re-parse the vault → public/graph/ + card art
```

---

## Adding notes and courses

The graph is generated from an Obsidian vault. `vault/` in this repo is a
**symlink** to `~/Documents/ComputerScienceVault`, so editing `vault/anything.md`
here edits the real vault — one set of files, no copy step, no drift. It's
gitignored; the generated artifacts under `public/graph/` are what get committed
and deployed.

After changing any note, publish it with:

```bash
npm run graph:sync
```

That's the only step. The vault is its own git repo, so vault edits are tracked
there and are separate from this repo's history.

> The symlink means an unfinished note in Obsidian is live to the next sync.
> That's fine because *you* choose when to sync — but nothing is snapshotted in
> between. `VAULT_PATH=/some/other/vault npm run graph:sync` overrides the
> location if you ever want to build from a copy instead.

### A new note

Nothing to configure. It appears in the graph on the next sync, and its topic
comes from its frontmatter `tags:` — every tag that maps to a bucket, not just
the first, so a note can belong to several. Untagged notes fall back to their
course folder.

Watch the sync output for `N tags matched no bucket`. That's not an error (the
folder fallback covered them), but if a new tag is one you'll reuse, add it to
`TAG_TO_TOPIC` in `scripts/topics.mjs`.

### A new course

A node is a *course* if and only if the index note links to it. So:

1. Write the course's parent note in the vault.
2. Link it from `Computer Science.md`, following the existing format —
   `- **[[NAME]]** — one-line description.` under the right year heading.
   Use a full vault path (`[[MATH 4TH YEAR/…/CRYPTOGRAPHY|CRYPTOGRAPHY]]`) only
   when the basename collides case-insensitively with another note, as
   `CRYPTOGRAPHY` does with `Books/Cryptography.md`.
3. Add it to `COURSE_TOPICS` in `scripts/topics.mjs`, most central topic first —
   the first entry colours the node, all of them are matched by the filter.
   Keep these **direct**: a course claims what it is about, not what it leans
   on. Machine Learning declares `math-stats`; Statistics does not claim
   `ml-ai` back, or every filter ends up showing every course.
4. Add its folder to `FOLDER_TO_TOPIC` so untagged notes inside it still bucket.
5. Sync. The script asserts one index node and reports the course count.

### A new topic bucket

Append to `TOPICS` in `scripts/topics.mjs`, then add a matching
`--graph-topic-<n>` to **all five** theme files — the index is positional. Ten
is about the ceiling for colours that stay distinguishable, especially on Doom
and Hacker Bro, whose palettes are deliberately narrow.

### Excluding something

`EXCLUDED_DIRS` / `EXCLUDED_NOTES` in `scripts/build-graph.mjs` drop a file
entirely. `REDACTIONS` rewrites content in place, and **the build fails if a
redaction pattern stops matching** — that's deliberate, so a vault edit can't
silently re-expose something. Delete the entry if it's genuinely no longer
needed; don't loosen the pattern.

---

## Things that bite

**Course nodes are pinned on a spiral, not simulated.**
`scripts/build-graph.mjs` walks the courses in primary-topic order (so the
spiral passes through related subjects and their shared notes sit between them),
gives each one an even share of `TURNS` revolutions, and grows the radius from
`R_MIN` to `R_MAX` across them — then pins them there for the solve. So the shipped
coordinates *are* the spiral. `sim.worker.ts` re-pins each course at the position
it loads from `graph.json` and returns it there when a drag ends, which means it
needs no radius, angle or turn count of its own: the one layout constant that
deliberately does *not* live in two places. Don't "fix" this by giving the worker
its own spiral maths.

`R_MIN` sets the spacing, since consecutive courses are roughly
`R_MIN * 2*PI*TURNS/n` apart at the tight inner end — more turns buy more room
there, which is why the two-turn form can start as close in as 260.

Three softer approaches are already ruled out. A `forceRadial` fixes a course's
*distance* from the index but not its bearing, so the hubs still clump to one
side; widening that ring to separate them only opens an empty moat, because the
course-to-index link (distance 95) pulls straight back in. A custom tangential
force fixes bearing but not distance, which balances the graph only roughly. And
a constant radius gives a clean ring, but every course ends up exactly as far
from the index as every other, which reads as mechanical.

**Layout constants live in three places and must agree.** Node radius, link
distance and collision padding appear in `scripts/build-graph.mjs` (build-time
solve), `src/graph/sim.worker.ts` (runtime sim) and `src/graph/renderer.ts`
(drawing). If they drift, the graph visibly lurches on the first drag as the
runtime settles into a different equilibrium than the shipped coordinates.
`scripts/render-preview.mjs` mirrors the radius too.

**Wikilink parsing lives in two places and must agree.** `extractLinks` in the
build script and `remarkWikilink` at runtime. Both must strip the alias pipe
(including the escaped `\|` form used in tables) and take the *last* path
segment. When they disagreed, cross-folder links became real graph edges that
rendered as greyed-out dead links in the panel.

**Never `rm -rf public/graph` before rewriting it.** The sync writes over the
top and prunes stale files. Deleting first opens a window where a dev server
answers `/graph/graph.json` with `index.html` from the SPA fallback — a
cacheable 200 of the wrong type that browsers hold onto long afterwards.

**Slugs must stay order-independent.** Six pairs of notes collapse to the same
base slug (`Cryptography`/`CRYPTOGRAPHY`, `Node JS`/`Node.js`). Collisions are
broken with a hash of the note's path, not an encounter counter, so adding a
note upstream can't move a suffix onto a different note and break every shared
URL.

**tsconfig is not strict but has teeth.** `erasableSyntaxOnly` rules out
constructor parameter properties and enums; `verbatimModuleSyntax` requires
`import type`; `noUnusedLocals` fails the build on a stray constant. Worker code
typechecks under a separate `tsconfig.worker.json` because `WebWorker` and `DOM`
libs collide.

**The canvas can't read CSS variables.** `src/graph/palette.ts` resolves them
through a hidden probe element, the same trick `getThemeAssetUrls()` uses in
`src/themes/preloadTheme.ts`. On a theme change the repaint must be synchronous
— it runs inside `startViewTransition`, which snapshots the canvas.
