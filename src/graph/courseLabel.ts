import type { GraphData } from './types';

/**
 * The line under the note's title in the reading panel.
 *
 * It used to be the vault path, which is where a note lives but not what it is
 * about: two folder names and a file extension to say "this is a Fourier and
 * Complex Analysis note". So it shows the course instead — the same string for
 * the course's own note and for every note belonging to it, because that is the
 * thing they share.
 *
 * Which course a note belongs to is decided at build time and shipped as
 * `node.course`; see the course-attribution section of
 * `scripts/build-graph.mjs` for why it cannot be worked out from `graph.json`.
 * All that is left here is naming: the course's title, and the two cases that
 * have no course at all.
 *
 * The course's number used to lead the line. Course numbers no longer leave the
 * build — see the course-code scrub in `scripts/build-graph.mjs` — so the title
 * stands on its own, and `node.folder` is all that survives of the path.
 */

/** Slug → the line to show under its title, or null for no line at all. */
export type CourseLine = (slug: string) => string | null;

export function buildCourseLine(data: GraphData): CourseLine {
  const bySlug = new Map(data.nodes.map((n) => [n.slug, n]));
  const cache = new Map<string, string | null>();

  return (slug: string) => {
    const hit = cache.get(slug);
    if (hit !== undefined) return hit;

    const node = bySlug.get(slug);
    let line: string | null = null;

    if (node) {
      /* The index is every course's parent and none of their notes, so it has
         no course of its own to name. It says what it is instead: the heading
         above already reads "Index", and this line says what that index holds. */
      if (node.kind === 'index') line = 'Topics List';
      else if (node.course !== null) line = data.nodes[node.course].title;
      // No course claims it — the books that no course draws on, a stray note
      // at the vault root. Name the folder, or nothing if there isn't one.
      else line = node.folder;
    }

    cache.set(slug, line);
    return line;
  };
}
