# Theme background images

Each theme has **four** backgrounds — one per section — that cross-fade with a
subtle zoom as you scroll (hero → education → projects → contact). Drop in files
with these exact names (JPG recommended, ~1920×1080+, landscape):

| Theme            | Hero                     | Education                     | Projects                     | Contact                     |
| ---------------- | ------------------------ | ----------------------------- | ---------------------------- | --------------------------- |
| Synthwave        | `synthwave-hero.jpg`     | `synthwave-education.jpg`     | `synthwave-projects.jpg`     | `synthwave-contact.jpg`     |
| Hacker Bro       | `hacker-bro-hero.jpg`    | `hacker-bro-education.jpg`    | `hacker-bro-projects.jpg`    | `hacker-bro-contact.jpg`    |
| Sleep Token      | `sleep-token-hero.jpg`   | `sleep-token-education.jpg`   | `sleep-token-projects.jpg`   | `sleep-token-contact.jpg`   |
| Editorial        | `editorial-hero.jpg`     | `editorial-education.jpg`     | `editorial-projects.jpg`     | `editorial-contact.jpg`     |
| Can It Run Doom? | `doom-hero.jpg`          | `doom-education.jpg`          | `doom-projects.jpg`          | `doom-contact.jpg`          |

Notes:
- A readability **scrim** + **gradient fallback** are applied per theme in
  `src/themes/definitions/<theme>.css`. If an image is missing, the section falls
  back to the gradient — nothing looks broken.
- Want the same image for all sections? Just duplicate the file under each name.
- Tune darkness per theme by editing that theme's `--bg-scrim` (one line).
- Compress large photos (e.g. squoosh.app), ideally < ~400KB each.
- **Adding a file is all it takes.** The token already points at these paths, so
  no code change is needed when art lands.

## Current state

Only some of these exist. Synthwave points at the original site's
`/images/home-bg.avif` and `/images/projects-bg.avif`; Sleep Token has its three
JPGs and reuses `sleep-token-contact.jpg` for Education. Hacker Bro, Editorial
and Doom have **no** images at all and render on their gradient, which is why
the gradients were designed to stand on their own.

> ⚠️ **Licensing.** `sleep-token-alt-1` (unused, no extension) is a watermarked
> Adobe Stock comp — tiled "Adobe Stock" text and the asset id `#1070491167`.
> It is not licensed for use. `sleep-token-projects.jpg` also appears to carry
> faint letterspaced text near its bottom edge. Confirm the provenance of both
> before this site goes in front of employers, and replace anything unlicensed.

## Generation prompts

Written to match the Sleep Token reference, which sets the house style:
**portrait, heavy edge vignette, an open and relatively quiet centre so text
stays readable, dark enough that the scrim barely has to work, and one accent
colour only.** Append your generator's own quality/aspect flags.

Per-section direction, applied on top of the theme recipe below:

- **hero** — most open; the largest area of quiet space, detail pushed to the edges.
- **education** — architectural, scholarly, ordered; suggestion of structure or archive.
- **projects** — busiest; more incident through the middle third.
- **contact** — quietest; near-empty centre, a single soft focal point.

### Sleep Token
> Deep emerald and forest green abstract texture, antique gold as the only
> accent. Mottled patina, ornamental filigree scrollwork creeping in from the
> edges, coiled serpent forms half-lost in shadow, alcohol-ink marble veined
> with gold leaf. Ritual, hushed, cathedral-dark. Heavy vignette, open centre.

### Synthwave
> Retro-futurist abstract in magenta and cyan on deep midnight violet. Horizon
> grid receding to a vanishing point, chrome sun, scanline haze, volumetric
> glow. Palette anchored on `#2a1155 → #12082b → #05030f`. Dark, neon, no text.

### Can It Run Doom?
> Grimy id-software-era texture: scorched metal, rust, ash and dried blood on
> near-black. Hellfire glow bleeding from the edges, pitted industrial surfaces,
> faint pentagram geometry. Anchored on `#3a120a → #1a0d09 → #0a0605`.

### Hacker Bro
> Phosphor-green CRT terminal on near-black. Scanlines, bloom, faint glyph rain,
> curvature at the edges of the tube, dust and screen burn. Monochrome except
> the green. Anchored on `#060a06 → #030503`.

### Editorial
> Warm off-white paper with letterpress tooth, soft ink wash, subtle deckled
> edge. The one **light** theme — keep it high-key with only a soft vignette;
> anything dark will fight the type. Burnt-orange accent used sparingly.
> Anchored on `#f6f1e8 → #efe8db`.
