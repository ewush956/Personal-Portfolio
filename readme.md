# Personal Portfolio

My personal portfolio, rebuilt in **React + TypeScript (Vite)** with a swappable
multi-theme system. Live at **[wushke.ca](https://wushke.ca)**.

## TODO 

- When clicking on cards, I want to be able to open the projects, each project will open a gallery where you can click through or use the arrows to cycle through images or a demo video of the  project. I don't want the demo videos to be iframe tags because they are often inconsistent. I am hoping for an actual solution using react to have videos that don't rely on an external source. 

- Add pokomodoro. 
## Themes

A "Themes" switcher at the top re-skins the entire site — colors, fonts, card
styles, backgrounds, and motion. Launch themes: **Synthwave**, **Hacker Bro**,
**Sleep Token**, **Editorial**, and **Can It Run Doom?**.

### Adding a theme

The system is built to extend. To add a theme:

1. Add an entry to `src/themes/registry.ts`.
2. Create `src/themes/definitions/<id>.css` implementing the token contract
   (see `src/themes/definitions/_contract.css`).
3. `@import` the new file in `src/themes/themes.css`.

No component changes needed — it appears in the switcher automatically.

Each theme has four section backgrounds (hero / education / projects / contact)
that cross-fade on scroll. Drop images into `public/images/backgrounds/` — see
the README there for filenames, current coverage, and generation prompts.

## Notes graph (`/graph`)

A separate page recreating my Obsidian vault's graph view: an Index node linking
out to every course, ~836 notes coloured by topic, hover-to-highlight
neighbourhoods, and a reading panel that renders the real note — LaTeX, code and
all — with `[[wikilinks]]` that navigate the graph.

It lives on its own route so none of its weight (graph data, canvas renderer, or
the markdown/KaTeX stack) loads unless someone asks for it. Every note has its
own URL, so `/graph/<slug>` is shareable and the back button walks your reading
trail.

Controls:

- **Click** a node to light its neighbourhood and open the note. Hover rings the
  node and names it in the corner readout — no highlight, and no label on the
  canvas, since that would be the same text twice.
- Following a `[[wikilink]]` remembers where you came from: the panel grows a
  back button labelled with the note you left. It's driven by router state, so
  it only appears when there's a note behind you and can never walk you off the
  graph page. Browser back works the same way.
- Labels are placed greedily in priority order — hovered, selected, the index,
  then courses, then notes — on a filled plate, and any label that would touch
  one already placed is simply not drawn. The screen never carries more text
  than it can show legibly; zooming frees space and the rest reappear.
- **The starting view carries one piece of text: “Start here.”** Course names
  arrive at ~1.6× the fitted zoom, note names at ~4.5×, and either appears
  immediately when selected or matched by a search. The thresholds are multiples
  of the fitted zoom rather than absolute scales, so the starting view looks the
  same on a laptop and a 4K monitor.
- The index node reads **“Start here”** on the canvas rather than naming itself.
  Its real title (`Computer Science`) still shows in the readout and on the note
  it opens.
- **Search** (`/` to focus) ranks exact and prefix matches first, and the index
  and courses above concept notes. Typing also dims the graph and rings every
  match, so you can see *where* a subject lives before picking a note.
- **View menu** (the hamburger) holds *Reset view* and the label mode:
  **Automatic**, **Courses only** (the default — course names only, note names
  never), or **None**. All three keep the opening frame bare except “Start here”;
  they differ in what appears once you zoom or select.
- **Full screen** is a toggle on the note itself, beside the close button, on
  screens wider than 720px. A phone doesn't get it: the sheet already gives the
  note the full width, and the control crowded the close button —
  it's a property of how you're reading that note, not a global view setting.
  It covers the graph entirely, which is the only way a note gets usable width
  in landscape on a phone; the graph's chrome hides with it, so the panel
  carries the way back out.
- **On a phone** the note is a bottom sheet that follows your finger: drag it
  down to collapse to a title bar, up to reopen, or tap the handle to toggle. A
  deliberate drag goes where you pushed it; a short one snaps to whichever end
  is nearer. Collapsing hands the graph back without closing the note. The
  filter starts collapsed to its header for the same reason, and focus zooms out
  further than on desktop since the sheet takes most of the screen.
- The filter's left edge lines up with the search field above it, and it steps
  aside entirely while a note is open.
- **Filter** shares the legend — the colour swatches are the checkboxes, with
  live counts. Courses get their own row above the rule, since turning off the
  spine is a different kind of decluttering than dropping a subject (and with
  courses hidden the topic territories read far more clearly). *All/None*
  governs the topic rows only, so "None" with courses left on gives you the
  degree's skeleton. The index is never filtered out — it's the way back in.
- Nodes carry **several topics**, and one enabled topic is enough to keep them:
  `A* Search` is both `ml-ai` and `algorithms`, `CSRF` is both `web` and
  `security`. Course nodes are filtered too, from a curated map in
  `scripts/topics.mjs` — so narrowing to Machine Learning & AI still shows the
  ML and AI courses. That map is deliberately **not transitive**: Machine
  Learning declares the linear algebra and statistics it leans on, but
  Statistics doesn't claim `ml-ai` back, or every filter would show every
  course.
- Nothing is highlighted on arrival. After you open a note, selection follows
  the last one you opened — so closing the panel leaves that neighbourhood lit
  where you're looking. *Reset view* clears it.
- Labels are drawn with a knocked-out halo so they stay readable over dense
  clusters, and the link mesh fades as you zoom out so nodes come forward.

### Syncing the vault

`vault/` is a **symlink** to the Obsidian vault at
`~/Documents/ComputerScienceVault`, so notes are edited in one place and there's
no copy step — just re-run the sync when you want the site to catch up:

```bash
npm run graph:sync
```

`scripts/build-graph.mjs` parses the vault, resolves wikilinks by basename,
buckets notes into topics (`scripts/topics.mjs`), solves the force layout once
with a fixed seed, and writes:

| Output | What it is |
| --- | --- |
| `public/graph/graph.json` | nodes, edges and solved coordinates (~43 KB gzipped) |
| `public/graph/notes/<slug>.json` | one note body each, fetched on demand |
| `public/images/graph-preview-<theme>.jpg` | Education-card art, one per theme |
| `src/data/graphStats.ts` | the counts shown on the Education card |

The sync writes over the existing output and prunes stale files rather than
deleting the tree first. Deleting leaves a window where `public/graph/` doesn't
exist, and a dev server answering a request in that window falls through to the
SPA fallback — returning `index.html`, as a cacheable 200, for `graph.json`.
Browsers hold onto that. `graph.json` is also fetched with the sync's build id
in the query string, so no cached response survives a re-sync.

**The vault itself is gitignored; the generated artifacts are committed.** That
way CI never needs the vault, and the exclusion/redaction rules at the top of
the sync script are the real publishing boundary rather than a hope. The script
**fails the build** if a redaction pattern stops matching, so a future vault edit
can't silently re-expose something.

Nodes never overlap: collision runs at full strength with per-kind clearance —
the index reserves a wide moat (nothing comes within ~37 units of its rim), the
course ring reserves enough not to merge, notes just enough that no two discs
touch. `pick()` then ranks by distance to a node's *edge* rather than its
centre, so clicking inside a large node can't hand you a speck resting near its
rim.

At runtime the layout is already solved, so the simulation in
`src/graph/sim.worker.ts` starts frozen at alpha 0. Dragging a node re-heats it;
letting go lets it settle and the loop stops. Nothing is drawn on a timer — an
idle graph costs nothing.

## Develop

```bash
npm install
npm run dev       # local dev server
npm run build     # typecheck + production build to dist/
npm run preview   # preview the production build
npm run lint      # oxlint
npm run graph:sync # re-parse the Obsidian vault → public/graph/ + card art
```

## Hosting

Deployed to GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`) on
every push to `main`. The custom domain `wushke.ca` is preserved via
`public/CNAME`.

## Tech

React 19 · TypeScript · Vite · React Router · Motion · canvas-confetti
d3-force / d3-quadtree · react-markdown · KaTeX
