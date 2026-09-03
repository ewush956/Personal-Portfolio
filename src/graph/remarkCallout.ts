import { visit } from 'unist-util-visit';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Render Obsidian callouts.
 *
 * Obsidian writes them as a blockquote whose first line is a type marker:
 *
 *     > [!note] Not a duplicate
 *     > Books/Cryptography.md and CRYPTOGRAPHY.md differ only in case.
 *
 * That's an Obsidian extension, so remark sees an ordinary blockquote and
 * leaves `[!note]` sitting in the prose as literal text. This turns the
 * blockquote into a titled callout and strips the marker.
 *
 * The vault uses three types today (`warning`, `note`, `todo`); the rest of
 * Obsidian's vocabulary is mapped anyway so a new one never renders as raw
 * text again. Foldable markers (`[!note]-` / `[!note]+`) are accepted and the
 * fold state ignored — everything renders open.
 */

/** Obsidian's type vocabulary, folded onto four visual treatments. */
const VARIANTS: Record<string, 'note' | 'tip' | 'warn' | 'danger'> = {
  note: 'note',
  info: 'note',
  abstract: 'note',
  summary: 'note',
  tldr: 'note',
  example: 'note',
  quote: 'note',
  cite: 'note',
  question: 'note',
  help: 'note',
  faq: 'note',
  tip: 'tip',
  hint: 'tip',
  important: 'tip',
  success: 'tip',
  check: 'tip',
  done: 'tip',
  todo: 'warn',
  warning: 'warn',
  caution: 'warn',
  attention: 'warn',
  danger: 'danger',
  error: 'danger',
  bug: 'danger',
  failure: 'danger',
  fail: 'danger',
  missing: 'danger',
};

/** Fallback heading when the author gave the callout no title of its own. */
function defaultTitle(type: string) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

const MARKER = /^\[!([A-Za-z]+)\][+-]?[ \t]*([^\n]*)\n?/;

export function remarkCallout() {
  return (tree: any) => {
    visit(tree, 'blockquote', (node: any) => {
      const firstBlock = node.children?.[0];
      if (firstBlock?.type !== 'paragraph') return;

      const lead = firstBlock.children?.[0];
      if (lead?.type !== 'text' || typeof lead.value !== 'string') return;

      const match = MARKER.exec(lead.value);
      if (!match) return;

      const type = match[1].toLowerCase();
      const variant = VARIANTS[type] ?? 'note';
      const title = match[2].trim() || defaultTitle(type);

      // Drop the marker line from the body. If that empties the paragraph
      // entirely — a callout whose title was its only content — drop the
      // paragraph too rather than leaving a blank line behind.
      lead.value = lead.value.slice(match[0].length);
      if (!lead.value && firstBlock.children.length === 1) {
        node.children.shift();
      }

      node.children.unshift({
        type: 'paragraph',
        data: { hName: 'div', hProperties: { className: ['callout__title'] } },
        children: [{ type: 'text', value: title }],
      });

      node.data = {
        hName: 'div',
        hProperties: { className: ['callout', `callout--${variant}`] },
      };
    });
  };
}
