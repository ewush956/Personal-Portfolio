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
   Topic no longer decides spiral position; the course's level does.
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

**Nothing simulates at runtime.** The layout is solved once, at build time, and
the shipped coordinates in `graph.json` are final — there is no worker and no
d3-force in the bundle. Nodes cannot be dragged; the camera is the only thing
that moves. Re-introducing a simulation would reproduce the same equilibrium at
the cost of a hot CPU on a phone, and it would break panning on touch: the graph
is dense enough that most of the canvas is nodes, so a swipe that starts on one
would move that node instead of the view.

**Course nodes are pinned on a spiral, ordered by course level.**
`scripts/build-graph.mjs` walks the courses from 1000-level outward, gives each
one an even share of `TURNS` revolutions, and grows the radius from `R_MIN` to
`R_MAX` across them — then pins them there for the solve. The shipped
coordinates *are* the spiral, and difficulty rises with the radius.

`courseLevel()` reads the level off the vault path: the numbered folder
(`MATH 4TH YEAR/MATH 4111/` → 4), falling back to the subject-year folder for
the few courses filed without a number of their own (`COMP 4TH YEAR/ARTIFICIAL
INTELLIGENCE.md` → 4), and null for notes that aren't coursework, which sort
outermost. Ties break on the order `Computer Science.md` lists them, counting
only links under a `## ` heading — the intro names a few courses out of sequence
and must not move them.

Level, not the year taken. The index groups by year and the two disagree in five
places: STATISTICS is MATH 2234 sitting under First year, ALGORITHMS AND
COMPLEXITY is a fourth-year course under Third. Ordering by heading put a
4000-level course third along the spiral.

This replaced an earlier primary-topic order, which kept related subjects
adjacent so their shared notes sat between neighbouring hubs. Level order gives
that up: a note shared by courses levels apart now spans the spiral, so the
middle carries more long links. Reading the arrangement as a difficulty ramp is
worth it.

`R_MIN` is set by the **labels**, not by the discs. Consecutive courses are
roughly `R_MIN * 2*PI*TURNS/n` apart at the tight inner end, and every course is
named in the survey view with its name hanging directly under it, so the inner
winding has to be long enough to park eight names side by side. At 300 it
offered ~800px of circumference for ~1200px of text and the overflow had nowhere
to go; 500 seats 25 of 32 labels on their first rung at 1440x900, against 17.
More turns buy room at the inner end too, which is why the two-turn form can
start closer in than a one-turn one.

Three softer approaches are already ruled out. A `forceRadial` fixes a course's
*distance* from the index but not its bearing, so the hubs still clump to one
side; widening that ring to separate them only opens an empty moat, because the
course-to-index link (distance 95) pulls straight back in. A custom tangential
force fixes bearing but not distance, which balances the graph only roughly. And
a constant radius gives a clean ring, but every course ends up exactly as far
from the index as every other, which reads as mechanical.

**Labels sit as close to their node as they can, below by preference.**
`src/graph/renderer.ts` builds every candidate slot — three depths (4/22/40px
from the node's edge) x seven sideways offsets (0 to ±95px) x above and below —
scores each by `drop + 1.5*|nudge| + 6 if above`, and takes the cheapest one
that is free. It will not place a label over a course or index disc, and a label
with no clear slot is simply not drawn: it returns as the zoom opens room, and
the panel lists every course meanwhile.

The weights are the whole design. Sideways costs more than down because an
offset label has to be traced back along its leader, while a lower one is still
in its node's column; above costs a flat 6 so below wins a tie but a *tight*
slot above still beats a distant one below. Ordering the search by depth and
then by side instead put names 60px off to one side with clear air sitting
directly over the node — and the ±95 offsets only ever win when the alternative
is not drawing the label at all. Measured in the browser at the survey zoom: 32
of 32 named at 1920x1080 and at 1440x900, 28 at 1280x800; at 1920 only three
labels move at all, and all three go straight up.

Labels used to step outward along the ray from the index instead. That seated
all 32 but put 23 of them on top of another disc at the survey zoom, and the
varying bearings read as arbitrary. Two things are coupled to the change and
should move with it: `R_MIN` above, and `courseFitZoom`'s `padding` (110 → 60),
which reserved a band around the ring for labels that no longer go there.

**Node radius lives in three places and must agree.** `scripts/build-graph.mjs`
(the collision term in the solve), `src/graph/renderer.ts` (drawing, hit-testing
and where a label sits) and `scripts/render-preview.mjs` (the card art). They no
longer have to match to avoid a lurch — nothing re-simulates — but if the
renderer's radius drifts from the build's, labels and clicks land off the discs
they belong to, and the card art stops matching the live graph.

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
`import type`; `noUnusedLocals` fails the build on a stray constant.

**The scene is a cached bitmap, so anything drawn into it has to be keyed.**
`scene()` in `src/graph/renderer.ts` strokes the link mesh, the discs and the
selection and search rings into an offscreen canvas, and `draw()` blits that.
13.7k links and ~950 discs cost about 10ms a frame between them and none of it
changes when the cursor moves — a hover adds one ring — so repainting the lot
for it was most of the hover lag. The bitmap is rebuilt only when its key
changes: canvas size, camera, `filterVersion`, `paletteVersion`,
`searchVersion`, and the selected node's id. Draw a new piece of state inside
`scene()` without adding it to that key and it paints once and then sits stale
until the camera moves. Anything that follows the *cursor* belongs in `draw()`
after the blit, where the hover ring and the labels are.

The same rule holds on the React side: hover lives in `GraphReadout`, not in
`GraphPage`. Hoisting it back up re-renders the search box, the legend, the
course list and the open note's rendered markdown on every mouse move.

**The canvas can't read CSS variables.** `src/graph/palette.ts` resolves them
through a hidden probe element, the same trick `getThemeAssetUrls()` uses in
`src/themes/preloadTheme.ts`. On a theme change the repaint must be synchronous
— it runs inside `startViewTransition`, which snapshots the canvas.
