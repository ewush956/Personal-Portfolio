# Theme background images

Each theme has **three** backgrounds — one per section — that cross-fade with a
subtle zoom as you scroll (hero → projects → contact). Drop in files with these
exact names (JPG recommended, ~1920×1080+, landscape):

| Theme            | Hero                     | Projects                     | Contact                     |
| ---------------- | ------------------------ | ---------------------------- | --------------------------- |
| Synthwave        | `synthwave-hero.jpg`     | `synthwave-projects.jpg`     | `synthwave-contact.jpg`     |
| Hacker Bro       | `hacker-bro-hero.jpg`    | `hacker-bro-projects.jpg`    | `hacker-bro-contact.jpg`    |
| Sleep Token      | `sleep-token-hero.jpg`   | `sleep-token-projects.jpg`   | `sleep-token-contact.jpg`   |
| Editorial        | `editorial-hero.jpg`     | `editorial-projects.jpg`     | `editorial-contact.jpg`     |
| Can It Run Doom? | `doom-hero.jpg`          | `doom-projects.jpg`          | `doom-contact.jpg`          |

Notes:
- A readability **scrim** + **gradient fallback** are applied per theme in
  `src/themes/definitions/<theme>.css`. If an image is missing, the section falls
  back to the gradient — nothing looks broken.
- Want the same image for all three sections? Just duplicate the file under each name.
- Tune darkness per theme by editing that theme's `--bg-scrim` (one line).
- Compress large photos (e.g. squoosh.app), ideally < ~400KB each.
