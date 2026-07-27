# Personal Portfolio

My personal portfolio, rebuilt in **React + TypeScript (Vite)** with a swappable
multi-theme system. Live at **[wushke.ca](https://wushke.ca)**.

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

Each theme has three section backgrounds (hero / projects / contact) that
cross-fade on scroll. Drop images into `public/images/backgrounds/` — see the
README there for filenames.

## Develop

```bash
npm install
npm run dev       # local dev server
npm run build     # typecheck + production build to dist/
npm run preview   # preview the production build
npm run lint      # oxlint
```

## Hosting

Deployed to GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`) on
every push to `main`. The custom domain `wushke.ca` is preserved via
`public/CNAME`.

## Tech

React 19 · TypeScript · Vite · Motion · canvas-confetti
