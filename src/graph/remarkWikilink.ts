import { visit } from 'unist-util-visit';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Turn Obsidian `[[wikilinks]]` into real mdast links.
 *
 * No standard markdown parser understands this syntax — to remark, `[[Foo]]` is
 * just literal text — so without this plugin every one of the vault's 12k
 * internal links would render as inert brackets.
 *
 * Handles the alias form `[[target|label]]` and the escaped-pipe form
 * `[[target\|label]]` that appears inside markdown tables. Heading (`#`) and
 * block (`^`) anchors are stripped; the vault uses neither, but a stray one
 * shouldn't break resolution.
 *
 * Targets are resolved through the caller's map rather than by re-deriving
 * slugs here — the build script already assigned them, and duplicating the
 * slug rules in a second place is how they drift apart.
 */

const WIKILINK = /\[\[([^\]]+)\]\]/g;

export interface WikilinkOptions {
  /** Note title (or alias) → slug. Returns null when the target doesn't exist. */
  resolve: (target: string) => string | null;
}

export function remarkWikilink(options: WikilinkOptions) {
  const { resolve } = options;

  return (tree: any) => {
    visit(tree, 'text', (node: any, index: number | undefined, parent: any) => {
      if (!parent || index === undefined || typeof node.value !== 'string') return;
      if (!node.value.includes('[[')) return;

      const out: any[] = [];
      let last = 0;
      WIKILINK.lastIndex = 0;

      for (const m of node.value.matchAll(WIKILINK)) {
        const start = m.index ?? 0;
        if (start > last) out.push({ type: 'text', value: node.value.slice(last, start) });

        const inner = m[1].replace(/\\\|/g, '|');
        const [rawTarget, rawLabel] = inner.split('|');
        const bare = rawTarget.split('#')[0].split('^')[0].trim();
        // Cross-folder links are written as full vault paths —
        // `[[MATH 4TH YEAR/MATH 4111/CRYPTOGRAPHY|CRYPTOGRAPHY]]`. Take the
        // last segment, exactly as the build script's extractLinks does. Without
        // this the two disagree: the link becomes a real edge in the graph but
        // renders greyed-out as unresolved in the note panel.
        const target = bare.split('/').pop() ?? bare;
        const label = (rawLabel ?? target).trim();
        const slug = resolve(target);

        if (slug) {
          out.push({
            type: 'link',
            url: `/graph/${slug}`,
            data: { hProperties: { className: 'wikilink' } },
            children: [{ type: 'text', value: label }],
          });
        } else {
          // Obsidian shows unresolved links greyed rather than hiding them.
          out.push({
            type: 'emphasis',
            data: { hName: 'span', hProperties: { className: 'wikilink wikilink--missing' } },
            children: [{ type: 'text', value: label }],
          });
        }

        last = start + m[0].length;
      }

      if (last < node.value.length) {
        out.push({ type: 'text', value: node.value.slice(last) });
      }
      if (out.length) parent.children.splice(index, 1, ...out);
    });
  };
}
