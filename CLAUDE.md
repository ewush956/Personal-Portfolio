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
   Use a full vault path (`[[SUBJ 4TH YEAR/…/CRYPTOGRAPHY|CRYPTOGRAPHY]]`) only
   when the basename collides case-insensitively with another note, as
   `CRYPTOGRAPHY` does with `Books/Cryptography.md`.
3. Add it to `COURSE_TOPICS` in `scripts/topics.mjs`, most central topic first —
   the first entry colours the node, all of them are matched by the filter.
   Topic no longer decides spiral position; the course's level does.
   Keep these **direct**: a course claims what it is about, not what it leans
   on. Machine Learning declares `math-stats`; Statistics does not claim
   `ml-ai` back, or every filter ends up showing every course.
4. Add its folder to `FOLDER_TO_TOPIC` so untagged notes inside it still bucket.
5. If it isn't filed in a numbered folder of its own, put `code: SUBJ 4630` in
   its frontmatter. Not for display — course codes don't ship (see the scrub
   below) — but so the scrub can find and remove a number the path never
   spells out.
6. Sync. The script asserts one index node, reports the course count, and says
   how many notes were attributed to a course by folder and how many by link.

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

**The graph wears the site's shell, so the camera has to know about it.**
`/graph` mounts the same `NavRail` the portfolio does and a header in the same
frosted `--header-bg` surface. The rail sits *beside* the canvas — `.graph-page`
is offset by `--rail-w` on desktop and by `--rail-h` above the phone's bottom
bar — so it never reaches the renderer. The header does sit over the canvas, and
because it is opaque rather than the gradient scrim it replaced, `panelInset()`
measures it (a `ResizeObserver` on the bar) and hands it to the renderer as
`inset.top`. `fit`, `focus`, `surveyFrame`, `courseFitZoom` and the label clamp
all read it; miss one and courses get framed or labelled behind the bar.

Two things follow from the rail. `--rail-h` in `base.css` is authoritative —
`NavRail.css` pins the mobile bar to it rather than letting padding decide, so
the graph can lay a fixed viewport out flush above it. And the renderer's
`narrow` check reads `window.innerWidth`, not the canvas: every rule it lines up
with is a CSS media query on the viewport, and with a 216px rail beside it the
canvas is narrow while the page is still showing the desktop reading panel.

The rail's collapsed state lives in `useRailCollapsed` (localStorage), shared
across the full page load between `/` and `/graph`.

**The phone frames by covering, and the sheet is the zoom control.**
Desktop `surveyFrame` *contains* the course ring in the visible band
(`courseFitZoom`, the smaller of the two axes). A phone's band is a wide strip —
390x135 with the sheet at rest — so containing it let the short side decide and
drew the whole degree at k=0.041, below `MIN_K`. `coverFrame` takes the *larger*
axis instead: 4.1x closer at rest, clipped top and bottom.

That one change also makes the sheet a zoom control, which is the point. Pull
the sheet down and the band grows; once it is taller than it is wide the height
takes over as the long side and the view keeps closing in on the open note —
another 1.75x from rest to floor. Three things have to hold for it to work:
`SHEET_SHUT` in `layout.ts` is both the drag floor and the bottom inset of a
*shut* sheet (collapsing deliberately keeps the resting height, so the camera
cannot read that as what the sheet occupies); `NotePanel` reports the live drag
height through `onDragHeight`, separate from `onHeight`'s resting one; and
`GraphPage` throttles that to `DRAG_FRAME_MS` because every camera move
repaints the cached scene — 13.7k links, on the thread dragging the sheet.

Every phone framing goes through it, the landing view included — `surveyFrame`
redirects a narrow screen there. Which is why opening the index is not a camera
move on a phone: the desktop's "Start here" exception re-surveys, and on a
phone that means re-covering against a band the opening sheet has just taken
60% of. There the index is a node like any other.

**A phone frames the note it opens, and pans for the ones after it.** Opening
the first note from the landing view frames it — `coverFrame`, zoom and all,
because the sheet is about to rise over most of the screen and the band it is
fitting into has just changed. `wasReading` is the edge that tells that from
the notes opened while already reading, and a cold load of `/graph/<slug>`
counts as an opening, which is how a shared link lands on its own note.

Opening a note *while reading* runs `panIntoView` instead: the zoom never
moves, and the camera translates toward centring the node, eased over
`PAN_MS`. How far toward is `centringWeight` — all the way at the spiral's
centre, none of the way at its rim, linear between, measured from the index and
scaled by the distance to the outermost node (1322). Centring an outlying node
points the view at the edge of the graph with empty canvas on three sides and
the spiral pushed off screen, so it arrives framed and unplaceable; a node near
the middle has the spiral around it whatever the camera does.

Under that sits a clamp: whatever more it takes to put the node inside the
band, with `PAN_MARGIN` of clearance. It is a floor, not the rule — it usually
adds nothing, and when it fires it moves the least that fixes things, so the
node lands at the edge rather than in the middle. **Clamp alone is a no-op for
a canvas tap**, which is worth knowing before simplifying this: a node you can
tap is already on screen, so the weighted move is the only thing that does
anything for the commonest interaction. The clamp earns its place on wikilinks,
search picks and back-navigation, where the target may be anywhere.

**The pan runs on the compositor, not on this thread.** Frame *cost* was never
the problem — measured on the dev server, a full scene re-stroke is 1.77ms and
a cached one 0.03ms, so a main-thread animation had budget to spare. The
problem is when the frames arrive. Opening a note fetches its JSON and, when
that lands, parses the markdown through remark, rehype, KaTeX and highlight in
one synchronous block, and nothing rAF-driven runs while that happens. A
clock-driven pan came back from it having spent most of its duration and
skipped to the end; capping the per-frame step fixed the skip and left a stall
in its place. Dragging never has either problem, because a drag advances by the
events it is handed and a busy thread simply pauses it.

So the camera is not animated at all. `planPan` paints the whole move into one
bitmap and `PanOverlay` (`panOverlay.ts`) slides it with a Web Animations
transform, which Chrome runs off the main thread; the camera lands in one step
at the end. Two things make that honest rather than a trick: a pan holds `k`
fixed, so every frame really is the same picture at a different offset; and the
bitmap covers the union of the start and end views, so nothing ever slides into
blank space. `PaintView` is what makes it expressible — `paintScene` and
`paintLabels` take the camera and band they are painting for instead of reading
`this.tx`, so the same code serves the live canvas and the oversized bitmap.
Labels ride along inside it, which is only correct because the move is a pure
translation.

Two failure modes are handled and both are easy to reintroduce. A hidden
document does not advance the animation timeline at all — `playState` still
says "running" while `currentTime` sits at zero — so mounting an overlay there
would pin a stale picture over the graph until the tab was looked at again;
`start` takes the move in one step instead, and a `visibilitychange` listener
plus a wall-clock timer end a slide that is hidden midway. And `resize`
cancels, because the overlay is a picture of a canvas at a size that no longer
exists.

`cancelPan` is the other half. A pan in flight is dropped by any `pointerdown`,
any zoom, and every one of the framing methods — a reader who grabs the canvas,
or a reset that supersedes the pan, has to win outright rather than fight an
animation. Because the camera does not move during a slide, cancelling reads
the overlay's live transform and converts it back through `panOrigin` — the
translation the bitmap was painted at — so an interrupted move keeps the view
the reader has already watched arrive at. `prefers-reduced-motion` takes the
target in one step. The duration scales with distance
(`PAN_MS_MIN`..`PAN_MS_MAX`): one flat 450ms made a short nudge feel dragged
out and a long haul crawl.

Only the reader moves it after that. The re-framing effect is keyed on
`sheetMove`, a counter that the sheet's own `onHeight`/`onCollapse` handlers
bump, plus the throttled drag and `handleReset`. It used to be keyed on
`sheetHeight`, `collapsed` and `legendH` directly, which cannot tell a drag from
a tap: opening a note expands a collapsed sheet and hides the topic list, so
every tap looked like the sheet moving. Closing a note frames imperatively —
the topic list is still `display:none` in that commit, so `handleReset` frames
against `legendShownRef`, the height the list last had on screen, rather than
the zero the live measurement reports. That ref is also why the legend's
`ResizeObserver` frames on its first non-zero measurement with nothing open: on
a cold load into a note the list is hidden from the load until the reader
closes it, so the reset reads a zero and the real height arrives a commit later.

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
(`SUBJ 4TH YEAR/SUBJ 4111/` → 4), falling back to the subject-year folder for
the few courses filed without a number of their own (`SUBJ 4TH YEAR/ARTIFICIAL
INTELLIGENCE.md` → 4), and null for notes that aren't coursework, which sort
outermost. Ties break on the order `Computer Science.md` lists them, counting
only links under a `## ` heading — the intro names a few courses out of sequence
and must not move them.

Level, not the year taken. The index groups by year and the two disagree in five
places: STATISTICS is a 2000-level course sitting under First year, ALGORITHMS AND
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

A phone takes none of that ladder. It labels the index and the selected node
and nothing else — a third of the width with the sheet over most of the height
has no room for thirty-two course names, and navigation there runs through the
pages rather than the canvas. The index is on that short list because the phone
lands on the survey view rather than inside the index note, so "Start here" is
the only thing on the landing screen that says what to do with the graph. It
still reads at 15px there, against 21 on a desktop.

Labels used to step outward along the ray from the index instead. That seated
all 32 but put 23 of them on top of another disc at the survey zoom, and the
varying bearings read as arbitrary. Two things are coupled to the change and
should move with it: `R_MIN` above, and `courseFitZoom`'s `padding` (110 → 60,
then 46 once the shell's header took a slice off the top of the band, then 36
once the nav rail took 216px off its width), which reserved a band around the
ring for labels that no longer go there.

That last cut is worth reading as a floor rather than a direction. The rail
costs this view a quarter of its zoom at 1440x900 — the ring is fitted into the
canvas *less* the reading panel, so 880px of band became 664 — and the label
text did not shrink with it, which is what puts the longest inner names —
`Introduction to Software Engineering`, `Human Computer Interaction` — out
sideways at the bottom of the ladder. Padding buys some of that back and then
turns on you: below ~30 the ring grows into the band's edges and the *outer*
names get clamped sideways instead. The remaining gap is only closeable by
making the course names smaller in this view or the reading panel narrower.

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

**Every node knows its course, and the folder decides before the links do.**
The line under the title in the reading panel used to be the vault path; it now
reads `Fourier and Complex Analysis`, the same string for the course note and
for everything belonging to it. `scripts/build-graph.mjs` works out which course
that is and ships it as `node.course`, a course node id; `src/graph/courseLabel.ts`
only names what it is handed, and adds the two cases with no course — the index
says `Topics List`, an unclaimed note names its folder.

The filing wins wherever it says anything. A course owns a folder when it sits
in its own numbered one (`SUBJ 4199/`) or beside a folder of its own name
(`Leetcode.md` next to `Leetcode/`), and everything underneath is its own —
840 of 948 notes. Nothing looser counts: `Books/` holds one course note and forty
unrelated books, and the three courses filed without numbers share
one subject-year folder with each other and 33 loose notes.

For the ~75 notes left, the links decide, and the direction is the whole point —
a course naming the note, not the note naming a course. Almost every note reaches
several courses on the way out (`Neural Network` links to Machine Learning,
Artificial Intelligence *and* Statistics) while being claimed by fewer.
**`graph.json` cannot answer this**: its edges are deduped to `min,max` and
course ids always sort below note ids, so every course-note pair looks identical
by the time it ships. That is why the attribution runs in the build, off the
vault, and not in the panel.

Claims still overlap, so they are ranked, and counting mentions of the note alone
does not separate them — AI names `Neural Network` three times, ML twice. The
*neighbourhood* does: the winner is the course naming the most of what the note
links to, which is the difference between mentioning a concept and being built
out of it (ML names 54 of Neural Network's neighbours to AI's 30). A topic filter
runs first and does the coarse work, dropping Calculus 1 and Linear Algebra from
`Back Propagation` before any counting; when nothing matches the note's topic
every claimant is ranked instead, which is what correctly leaves `Karnaugh Maps`
with The New Turing Omnibus. Ties fall to the more direct mention, then to the
lower course id, so nothing depends on map iteration order.

**No course code leaves the build.** A registrar's number pins a note to one
institution's offering of a subject, which is the one claim on this material
that isn't the author's to make, so the scrub in `scripts/build-graph.mjs`
takes them all out on the way to `public/graph/`: out of note bodies, out of
`course/…` tags, and out of the paths that used to ship on every node (only
`node.folder` survives, and only because four notes no course claims fall back
to naming their folder).

The vault keeps them. The scrub runs on the way out, like `REDACTIONS`, so
Obsidian still has the filing it needs and nothing is maintained twice. It runs
*after* the solve, for two reasons: most codes read best replaced by the
course's own **name**, and that map is built from the course nodes, so it can't
exist earlier; and running last means the scrub can't perturb link extraction,
attribution or the layout.

Read `CODE_SCRUB` as a pipeline — each rule assumes the ones above it have run,
and most codes are gone before the last two see them. `([[STATISTICS]], SUBJ
2234)` loses a parenthetical; `[[…|SUBJ 2303]]` loses a label; a full vault path
inside a wikilink loses its folders, which changes no edge because both link
parsers already take the last segment. Only what's left — `[[Kernel]] in SUBJ
2655`, or a course note opening with its own number — is rewritten to the
course's name.

**The guarantee is `assertScrubbed`, not the rules.** Nothing is written until
it passes, and it looks for any three- or four-letter prefix on a four-digit
number, not just the five subjects the vault has: a new one fails loudly rather
than shipping unnoticed. It reads real newlines rather than a JSON string's
`\n` escapes, because a code can wrap across a line — and the vault's
blockquotes carry a `> ` onto the continuation, so `the one SUBJ\n> 2633 does
not` has to match as one code. It doesn't, and the prefix gets rewritten while
the digits sit there looking like prose.

Two things are *deliberately* not scrubbed. `[[DISCRETE MATH]]` is a note's real
title, so the bare-prefix rule matches wikilinks only to pass them through
untouched. And the vault folder names in `FOLDER_TO_TOPIC` and
`check-notes.mjs`'s `BATCHES` are how those scripts find the vault; they are
build inputs, not output, and the site ships none of them.

**`code:` in a course's frontmatter is a scrub input.** `courseCode()` reads the
number off the path and that covers 26 of 32 courses; the rest have nowhere in
the vault to put it, so `code: SUBJ 4630` at the top of `MACHINE LEARNING.md`
supplies it — which is how `courseNameByCode` knows to rewrite that number
where a note writes it out. It is deliberately not fed to `courseLevel()`, which
still reads the folder, so adding a code cannot silently re-solve the spiral.

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
13.7k links and ~950 discs cost 1.77ms a frame between them (measured, at the
phone's reading zoom; a cached frame is 0.03ms) and none of it
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
