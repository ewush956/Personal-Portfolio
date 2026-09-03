import type { GraphData, GraphNode } from './types';

/**
 * The line under the note's title in the reading panel.
 *
 * It used to be the vault path, which is where a note lives but not what it is
 * about: `MATH 4TH YEAR/MATH 4199/Fourier Series.md` names two folders and a
 * file extension to say "this is a Fourier and Complex Analysis note". So it
 * shows the course instead — the same string for the course's own note and for
 * every note belonging to it, because that is the thing they share.
 *
 * Which course a note belongs to is decided at build time and shipped as
 * `node.course`; see the course-attribution section of
 * `scripts/build-graph.mjs` for why it cannot be worked out from `graph.json`.
 * All that is left here is naming: the course's number, its title, and the two
 * cases that have no course at all.
 */

const dirOf = (p: string) => {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
};

/** Slug → the line to show under its title, or null for no line at all. */
export type CourseLine = (slug: string) => string | null;

/** A course reads as `COMP 1633: Introduction to Computer Science 2` wherever
    it has a number, and as its bare title where it genuinely has none — the
    reading courses and Leetcode. The number is resolved at build time, so a
    course filed without a numbered folder can still carry one in frontmatter. */
const nameOf = (course: GraphNode) =>
  course.code ? `${course.code}: ${course.title}` : course.title;

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
      if (node.kind === 'index') line = 'Course List';
      else if (node.course !== null) line = nameOf(data.nodes[node.course]);
      // No course claims it — the books that no course draws on, a stray note
      // at the vault root. Name the folder, or nothing if there isn't one.
      else line = dirOf(node.path) || null;
    }

    cache.set(slug, line);
    return line;
  };
}
